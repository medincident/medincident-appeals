// ai-medincident-backend — подключается к NATS JetStream, делает две вещи:
//
//  1. Читает категории из KV (bucket "medincident"), следит за обновлениями,
//     отдаёт через HTTP GET /categories.
//  2. Потребляет обращения из стрима APPEALS по subject "appeals.submit":
//     зовёт nlp-service /analyze, публикует результат в "appeals.result.<id>".
//     ack_explicit + file storage → сообщения не теряются при рестарте.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/nats-io/nats.go"
)

const (
	kvBucket           = "medincident"
	kvKey              = "categories"
	natsConnectRetries = 15
	natsConnectDelay   = 2 * time.Second
	kvLoadAttempts     = 20
	kvLoadDelay        = 2 * time.Second

	// ── JetStream стрим обращений ─────────────────────────────────────────
	appealsStream      = "APPEALS"
	appealsSubmitSubj  = "appeals.submit"
	appealsResultSubj  = "appeals.result.*"
	appealsDurable     = "appeals-backend"
	appealsQueue       = "appeals-workers"
	appealsAckWait     = 60 * time.Second
	appealsMaxDeliver  = 5
	appealsMaxAge      = 7 * 24 * time.Hour
	nlpAnalyzeTimeout  = 30 * time.Second
)

type category struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	Description   string        `json:"description,omitempty"`
	Subcategories []subcategory `json:"subcategories,omitempty"`
}

type subcategory struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// cache — потокобезопасный кэш категорий в памяти.
type cache struct {
	mu   sync.RWMutex
	data []category
}

func (c *cache) set(cats []category) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.data = cats
}

func (c *cache) snapshot() []category {
	c.mu.RLock()
	defer c.mu.RUnlock()
	// возвращаем копию — чтобы вызывающий не мог мутировать кэш
	cp := make([]category, len(c.data))
	copy(cp, c.data)
	return cp
}

func (c *cache) len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.data)
}

// connectNATS — подключается к NATS с ретраями. Возвращает RuntimeError-like exit при исчерпании.
func connectNATS(url string) (*nats.Conn, error) {
	var last error
	for attempt := 1; attempt <= natsConnectRetries; attempt++ {
		nc, err := nats.Connect(url)
		if err == nil {
			slog.Info("connected to NATS", "url", url)
			return nc, nil
		}
		last = err
		slog.Warn("NATS connect failed", "attempt", attempt, "max", natsConnectRetries, "error", err)
		time.Sleep(natsConnectDelay)
	}
	return nil, last
}

func logCategories(cats []category) {
	totalSub := 0
	for _, c := range cats {
		totalSub += len(c.Subcategories)
	}
	slog.Info("cache updated", "categories", len(cats), "subcategories", totalSub)
	for _, c := range cats {
		slog.Info("  [category]", "id", c.ID, "name", c.Name)
		for _, s := range c.Subcategories {
			slog.Info("    └─ [sub]", "id", s.ID, "name", s.Name)
		}
	}
}

// loadFromKV — одноразовая попытка прочитать категории из KV.
func loadFromKV(js nats.JetStreamContext, c *cache) bool {
	kv, err := js.KeyValue(kvBucket)
	if err != nil {
		slog.Debug("KV not available yet", "bucket", kvBucket, "error", err)
		return false
	}
	entry, err := kv.Get(kvKey)
	if err != nil {
		slog.Debug("KV key not found", "key", kvKey, "error", err)
		return false
	}
	var cats []category
	if err := json.Unmarshal(entry.Value(), &cats); err != nil {
		slog.Warn("KV value is not valid JSON", "error", err)
		return false
	}
	slog.Info("loaded categories from KV", "count", len(cats), "bucket", kvBucket, "key", kvKey)
	c.set(cats)
	logCategories(cats)
	return true
}

// loadWithRetry — повторные попытки, пока categories-service не опубликует данные.
func loadWithRetry(js nats.JetStreamContext, c *cache) {
	for attempt := 1; attempt <= kvLoadAttempts; attempt++ {
		if loadFromKV(js, c) {
			return
		}
		slog.Info("categories not yet available, retrying", "attempt", attempt, "max", kvLoadAttempts)
		time.Sleep(kvLoadDelay)
	}
	slog.Warn("could not load categories after retries — waiting for KV watcher update")
}

// watchKV — бесконечный вотчер. При обновлении ключа перечитывает и обновляет кэш.
func watchKV(ctx context.Context, js nats.JetStreamContext, c *cache) {
	for {
		if ctx.Err() != nil {
			return
		}
		kv, err := js.KeyValue(kvBucket)
		if err != nil {
			slog.Warn("KV watcher: cannot open bucket", "error", err, "retry_in", "5s")
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
				continue
			}
		}
		watcher, err := kv.WatchAll()
		if err != nil {
			slog.Warn("KV watcher: cannot start", "error", err, "retry_in", "5s")
			time.Sleep(5 * time.Second)
			continue
		}
		slog.Info("watching KV for updates", "bucket", kvBucket)
		for {
			select {
			case <-ctx.Done():
				_ = watcher.Stop()
				return
			case entry, ok := <-watcher.Updates():
				if !ok {
					slog.Warn("KV watcher channel closed — reopening")
					goto reopen
				}
				if entry == nil || entry.Key() != kvKey {
					continue
				}
				var cats []category
				if err := json.Unmarshal(entry.Value(), &cats); err != nil {
					slog.Warn("KV update: invalid JSON", "error", err)
					continue
				}
				slog.Info("KV update received", "categories", len(cats), "revision", entry.Revision())
				c.set(cats)
				logCategories(cats)
			}
		}
	reopen:
		_ = watcher.Stop()
	}
}

// ── Appeals orchestration ────────────────────────────────────────────────────
//
// Формат сообщений в subject "appeals.submit":
//
//	{
//	  "id": "<uuid>",           // генерируется на фронтенде, ключ корреляции
//	  "text": "<сырой текст>",
//	  "user_id": "<zitadel id, опц.>",
//	  "created_at": "<ISO-8601>"
//	}
//
// Ответ публикуется в "appeals.result.<id>" — JSON того же вида, что и
// AnalyzeResponse от nlp-service + добавлено поле "id".

type appealSubmit struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	UserID    string `json:"user_id,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
}

type nlpAnalyzeResponse struct {
	IsImportant         bool              `json:"is_important"`
	ImportantConfidence float64           `json:"important_confidence,omitempty"`
	Reason              string            `json:"reason,omitempty"`
	FormalizedText      string            `json:"formalized_text,omitempty"`
	Theses              []string          `json:"theses,omitempty"`
	Category            map[string]string `json:"category,omitempty"`
	Subcategory         map[string]string `json:"subcategory,omitempty"`
}

type appealResult struct {
	ID string `json:"id"`
	nlpAnalyzeResponse
}

type appealError struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

// ensureAppealsStream — идемпотентно создаёт стрим APPEALS с file storage.
// Если стрим уже есть — ничего не меняет (AddStream вернёт ErrStreamNameAlreadyInUse,
// что здесь OK — доверяем существующей конфигурации).
func ensureAppealsStream(js nats.JetStreamContext) error {
	cfg := &nats.StreamConfig{
		Name:      appealsStream,
		Subjects:  []string{appealsSubmitSubj, appealsResultSubj},
		Storage:   nats.FileStorage, // на диск — переживает рестарт
		Retention: nats.LimitsPolicy,
		MaxAge:    appealsMaxAge,
		Replicas:  1,
	}
	if _, err := js.StreamInfo(appealsStream); err == nil {
		// уже есть — актуализируем subjects/retention на случай апдейта кода
		if _, err := js.UpdateStream(cfg); err != nil {
			slog.Warn("UpdateStream failed (non-fatal)", "error", err)
		}
		return nil
	}
	if _, err := js.AddStream(cfg); err != nil {
		return fmt.Errorf("AddStream %s: %w", appealsStream, err)
	}
	slog.Info("JetStream stream created",
		"name", appealsStream,
		"subjects", cfg.Subjects,
		"storage", "file",
		"max_age", appealsMaxAge)
	return nil
}

// callNLP — POST в nlp-service /analyze с таймаутом.
func callNLP(ctx context.Context, nlpURL, text string) (*nlpAnalyzeResponse, error) {
	payload, err := json.Marshal(map[string]any{"text": text})
	if err != nil {
		return nil, err
	}
	rctx, cancel := context.WithTimeout(ctx, nlpAnalyzeTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(rctx, http.MethodPost, nlpURL+"/analyze",
		bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("nlp-service %d: %s", resp.StatusCode, string(body))
	}
	var out nlpAnalyzeResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode nlp response: %w", err)
	}
	return &out, nil
}

// makeSummary — короткая выжимка из текста для списка, как на фронте.
func makeSummary(text string, max int) string {
	s := strings.Join(strings.Fields(text), " ")
	if len([]rune(s)) <= max {
		return s
	}
	r := []rune(s)
	return string(r[:max-1]) + "…"
}

// strPtr — вспомогательная, возвращает nil для пустых строк.
func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// buildAppealRow — собирает строку для Postgres из NLP-ответа и submit-запроса.
func buildAppealRow(req appealSubmit, resp *nlpAnalyzeResponse) AppealRow {
	var createdAt time.Time
	if req.CreatedAt != "" {
		if t, err := time.Parse(time.RFC3339, req.CreatedAt); err == nil {
			createdAt = t
		}
	}

	var conf *float64
	if resp.ImportantConfidence != 0 {
		v := resp.ImportantConfidence
		conf = &v
	}

	row := AppealRow{
		ID:                  req.ID,
		UserID:              req.UserID,
		Text:                req.Text,
		Summary:             makeSummary(req.Text, 50),
		FormalizedText:      resp.FormalizedText,
		IsImportant:         resp.IsImportant,
		ImportantConfidence: conf,
		Reason:              resp.Reason,
		Theses:              resp.Theses,
		Status:              "processed",
		CreatedAt:           createdAt,
	}
	if cid, ok := resp.Category["id"]; ok {
		row.CategoryID = strPtr(cid)
		if name, ok := resp.Category["name"]; ok {
			row.CategoryName = strPtr(name)
		}
	}
	if sid, ok := resp.Subcategory["id"]; ok {
		row.SubcategoryID = strPtr(sid)
		if name, ok := resp.Subcategory["name"]; ok {
			row.SubcategoryName = strPtr(name)
		}
	}
	if row.Theses == nil {
		row.Theses = []string{}
	}
	return row
}

// handleAppeal — обрабатывает одно сообщение: валидирует, зовёт NLP,
// сохраняет в Postgres, публикует результат через JetStream и ack исходника.
// При ошибке NLP или БД — NAK с задержкой (до MaxDeliver попыток).
//
// Порядок: NLP → DB (upsert) → publish result → ack. Если сохранение в БД
// упало — не публикуем, чтобы фронт не подумал «готово», а сообщение
// осталось в JetStream и повторилось.
func handleAppeal(
	ctx context.Context,
	nc *nats.Conn,
	js nats.JetStreamContext,
	store *Store,
	nlpURL string,
	m *nats.Msg,
) {
	var req appealSubmit
	if err := json.Unmarshal(m.Data, &req); err != nil {
		slog.Error("appeals.submit: invalid JSON, dropping", "error", err)
		_ = m.Term()
		return
	}
	if req.ID == "" || req.Text == "" {
		slog.Error("appeals.submit: missing id/text, dropping", "id", req.ID)
		_ = m.Term()
		return
	}

	md, _ := m.Metadata()
	var deliveryNum uint64
	if md != nil {
		deliveryNum = md.NumDelivered
	}
	slog.Info("processing appeal",
		"id", req.ID,
		"user_id", req.UserID,
		"chars", len(req.Text),
		"delivery", deliveryNum)

	resultSubj := "appeals.result." + req.ID

	resp, err := callNLP(ctx, nlpURL, req.Text)
	if err != nil {
		slog.Error("nlp-service call failed", "id", req.ID, "error", err)
		errPayload, _ := json.Marshal(appealError{ID: req.ID, Error: err.Error()})
		if pubErr := nc.Publish(resultSubj, errPayload); pubErr != nil {
			slog.Error("publish error result failed", "id", req.ID, "error", pubErr)
		}
		_ = m.NakWithDelay(5 * time.Second)
		return
	}

	if store != nil && req.UserID != "" {
		row := buildAppealRow(req, resp)
		dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := store.Save(dbCtx, row)
		cancel()
		if err != nil {
			slog.Error("postgres save failed, will retry", "id", req.ID, "error", err)
			_ = m.NakWithDelay(3 * time.Second)
			return
		}
	} else if req.UserID == "" {
		slog.Warn("appeal without user_id — not persisting to DB", "id", req.ID)
	}

	result := appealResult{ID: req.ID, nlpAnalyzeResponse: *resp}
	payload, err := json.Marshal(result)
	if err != nil {
		slog.Error("marshal result failed", "id", req.ID, "error", err)
		_ = m.Term()
		return
	}
	if _, err := js.Publish(resultSubj, payload, nats.MsgId("result-"+req.ID)); err != nil {
		slog.Error("publish result failed, will retry", "id", req.ID, "error", err)
		_ = m.NakWithDelay(2 * time.Second)
		return
	}
	if err := m.Ack(); err != nil {
		slog.Warn("ack failed", "id", req.ID, "error", err)
		return
	}
	slog.Info("appeal processed",
		"id", req.ID,
		"is_important", resp.IsImportant,
		"category", resp.Category["name"])
}

// startAppealsConsumer — запускает durable queue-subscribe на appeals.submit.
// QueueSubscribe + Durable = пул воркеров, переживающий рестарты.
func startAppealsConsumer(
	ctx context.Context,
	nc *nats.Conn,
	js nats.JetStreamContext,
	store *Store,
	nlpURL string,
) (*nats.Subscription, error) {
	sub, err := js.QueueSubscribe(
		appealsSubmitSubj,
		appealsQueue,
		func(m *nats.Msg) { handleAppeal(ctx, nc, js, store, nlpURL, m) },
		nats.BindStream(appealsStream),
		nats.Durable(appealsDurable),
		nats.ManualAck(),
		nats.AckWait(appealsAckWait),
		nats.MaxDeliver(appealsMaxDeliver),
		nats.DeliverAll(), // с самого начала, durable помнит позицию
	)
	if err != nil {
		return nil, fmt.Errorf("QueueSubscribe %s: %w", appealsSubmitSubj, err)
	}
	slog.Info("appeals consumer started",
		"stream", appealsStream,
		"subject", appealsSubmitSubj,
		"durable", appealsDurable,
		"queue", appealsQueue,
		"ack_wait", appealsAckWait,
		"max_deliver", appealsMaxDeliver)
	return sub, nil
}

// ── main ─────────────────────────────────────────────────────────────────────

func main() {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://nats:4222"
	}
	nlpURL := os.Getenv("NLP_SERVICE_URL")
	if nlpURL == "" {
		nlpURL = "http://nlp-service:8000"
	}
	httpAddr := os.Getenv("HTTP_ADDR")
	if httpAddr == "" {
		httpAddr = ":8080"
	}
	dbURL := os.Getenv("DATABASE_URL")
	zitadelIssuer := os.Getenv("ZITADEL_ISSUER")

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	slog.Info("starting ai-medincident-backend")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Postgres (обязателен: фронт ждёт REST из него).
	if dbURL == "" {
		log.Fatalf("DATABASE_URL is required")
	}
	store, err := NewStore(ctx, dbURL)
	if err != nil {
		log.Fatalf("postgres init: %v", err)
	}
	defer store.Close()
	slog.Info("postgres ready")

	// Zitadel JWT validator — нужен на REST. Если issuer пустой, endpoint
	// просто вернёт 503 (защита от случайного запуска без auth-конфига).
	var authVerifier *Auth
	if zitadelIssuer != "" {
		authVerifier, err = NewAuth(ctx, zitadelIssuer)
		if err != nil {
			log.Fatalf("JWT verifier init: %v", err)
		}
		slog.Info("Zitadel JWKS loaded", "issuer", zitadelIssuer)
	} else {
		slog.Warn("ZITADEL_ISSUER not set — REST /users/:id/appeals will return 503")
	}

	nc, err := connectNATS(natsURL)
	if err != nil {
		log.Fatalf("cannot connect to NATS: %v", err)
	}
	defer nc.Drain()

	js, err := nc.JetStream()
	if err != nil {
		log.Fatalf("cannot access JetStream: %v", err)
	}

	c := &cache{}
	loadWithRetry(js, c)
	go watchKV(ctx, js, c)

	if err := ensureAppealsStream(js); err != nil {
		log.Fatalf("ensure appeals stream: %v", err)
	}
	appealsSub, err := startAppealsConsumer(ctx, nc, js, store, nlpURL)
	if err != nil {
		log.Fatalf("start appeals consumer: %v", err)
	}

	app := fiber.New(fiber.Config{
		AppName:               "ai-medincident-backend",
		DisableStartupMessage: true,
	})

	app.Get("/health", func(ctx *fiber.Ctx) error {
		return ctx.JSON(fiber.Map{
			"status":            "ok",
			"categories_cached": c.len(),
			"nats_connected":    nc.IsConnected(),
			"appeals_consumer":  appealsSub.IsValid(),
			"auth":              authVerifier != nil,
		})
	})

	app.Get("/categories", func(ctx *fiber.Ctx) error {
		return ctx.JSON(fiber.Map{"categories": c.snapshot()})
	})

	// GET /users/:userId/appeals?search=&category=&subcategory=
	// Авторизация: Bearer-access_token от Zitadel. sub токена должен совпасть
	// с :userId из URL — запретим читать чужие обращения.
	app.Get("/users/:userId/appeals", func(fctx *fiber.Ctx) error {
		if authVerifier == nil {
			return fctx.Status(fiber.StatusServiceUnavailable).
				JSON(fiber.Map{"error": "auth not configured"})
		}
		sub, err := authVerifier.VerifiedSubject(fasthttpToStdRequest(fctx))
		if err != nil {
			slog.Warn("auth failed", "error", err, "path", fctx.Path())
			return fctx.Status(fiber.StatusUnauthorized).
				JSON(fiber.Map{"error": "unauthorized"})
		}
		userID := fctx.Params("userId")
		if userID == "" {
			return fctx.Status(fiber.StatusBadRequest).
				JSON(fiber.Map{"error": "missing userId"})
		}
		if sub != userID {
			return fctx.Status(fiber.StatusForbidden).
				JSON(fiber.Map{"error": "cannot access another user's appeals"})
		}

		f := ListFilter{
			UserID:        userID,
			Search:        strings.TrimSpace(fctx.Query("search")),
			CategoryID:    strings.TrimSpace(fctx.Query("category")),
			SubcategoryID: strings.TrimSpace(fctx.Query("subcategory")),
		}
		listCtx, listCancel := context.WithTimeout(ctx, 10*time.Second)
		defer listCancel()
		rows, err := store.List(listCtx, f)
		if err != nil {
			slog.Error("list appeals failed", "user", userID, "error", err)
			return fctx.Status(fiber.StatusInternalServerError).
				JSON(fiber.Map{"error": "query failed"})
		}
		return fctx.JSON(fiber.Map{"appeals": rows})
	})

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-shutdown
		slog.Info("shutdown signal received")
		cancel()
		_ = appealsSub.Drain()
		_ = app.Shutdown()
	}()

	slog.Info("HTTP server listening", "addr", httpAddr, "nlp_url", nlpURL)
	if err := app.Listen(httpAddr); err != nil {
		log.Fatalf("HTTP server failed: %v", err)
	}
}

// fasthttpToStdRequest — адаптер Fiber's fasthttp.Request в net/http.Request,
// чтобы auth.VerifiedSubject мог читать заголовок Authorization универсально.
// Нам нужен только Header — body/URL не читаются из JWT-валидации.
func fasthttpToStdRequest(fctx *fiber.Ctx) *http.Request {
	h := http.Header{}
	fctx.Request().Header.VisitAll(func(k, v []byte) {
		h.Add(string(k), string(v))
	})
	return &http.Request{Header: h}
}
