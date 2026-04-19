// llm-service — Go+Fiber обёртка над Ollama.
//
// Делает:
//   - запускает `ollama serve` как subprocess и ждёт готовности
//   - докачивает модель если её нет в volume
//   - читает категории из NATS JetStream KV (с watcher'ом)
//   - отдаёт HTTP API:
//       POST /analyze            — полный пайплайн: text → структурированный JSON
//                                  (такой же контракт как у nlp-service)
//       GET  /health             — статус Ollama + NATS
//       GET  /categories         — текущий кэш категорий
//       /v1/*                    — прозрачный прокси в Ollama (OpenAI-совместимый API)
//
// Ollama слушает на 127.0.0.1:11435 внутри контейнера.
// Наш Fiber торчит наружу на :11434 (тот же порт, что был у Ollama —
// старые скрипты benchmark_llm.py продолжают работать через /v1/*).
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
	"os/exec"
	"os/signal"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/nats-io/nats.go"
)

const (
	ollamaInternalHost = "127.0.0.1:11435"
	kvBucket           = "medincident"
	kvKey              = "categories"
	natsConnectRetries = 15
	natsConnectDelay   = 2 * time.Second
	ollamaReadyTimeout = 120 * time.Second
	pullTimeout        = 15 * time.Minute
	analyzeTimeout     = 180 * time.Second
)

// ── Типы данных ──────────────────────────────────────────────────────────────

type subcategory struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

type category struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	Description   string        `json:"description,omitempty"`
	Subcategories []subcategory `json:"subcategories,omitempty"`
}

type idName struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// analyzeResponse — тот же контракт что и у nlp-service POST /analyze.
type analyzeResponse struct {
	IsImportant    bool     `json:"is_important"`
	Reason         string   `json:"reason"`
	FormalizedText string   `json:"formalized_text"`
	Theses         []string `json:"theses"`
	Category       *idName  `json:"category"`
	Subcategory    *idName  `json:"subcategory"`
}

// ── Кэш категорий ────────────────────────────────────────────────────────────

type categoryCache struct {
	mu   sync.RWMutex
	data []category
}

func (c *categoryCache) set(cats []category) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.data = cats
}

func (c *categoryCache) snapshot() []category {
	c.mu.RLock()
	defer c.mu.RUnlock()
	cp := make([]category, len(c.data))
	copy(cp, c.data)
	return cp
}

func (c *categoryCache) len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.data)
}

// ── Управление Ollama-процессом ──────────────────────────────────────────────

func startOllama(ctx context.Context) (*exec.Cmd, error) {
	cmd := exec.CommandContext(ctx, "ollama", "serve")
	cmd.Env = append(os.Environ(), "OLLAMA_HOST="+ollamaInternalHost)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	slog.Info("starting ollama serve", "host", ollamaInternalHost)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return cmd, nil
}

func waitForOllama(ctx context.Context) error {
	deadline := time.Now().Add(ollamaReadyTimeout)
	url := "http://" + ollamaInternalHost + "/"
	client := &http.Client{Timeout: 3 * time.Second}
	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				slog.Info("ollama is ready")
				return nil
			}
		}
		time.Sleep(1 * time.Second)
	}
	return fmt.Errorf("ollama did not become ready within %s", ollamaReadyTimeout)
}

// modelPresent — проверяет что модель уже скачана (через `ollama list`).
func modelPresent(model string) (bool, error) {
	cmd := exec.Command("ollama", "list")
	cmd.Env = append(os.Environ(), "OLLAMA_HOST="+ollamaInternalHost)
	out, err := cmd.Output()
	if err != nil {
		return false, err
	}
	// Имя модели может иметь форму "qwen2.5:3b" — в выводе ollama list тег может
	// отсутствовать, поэтому ищем по базовому имени.
	base := model
	if i := strings.Index(model, ":"); i > 0 {
		base = model[:i]
	}
	return strings.Contains(string(out), base), nil
}

func pullModel(ctx context.Context, model string) error {
	pctx, cancel := context.WithTimeout(ctx, pullTimeout)
	defer cancel()
	cmd := exec.CommandContext(pctx, "ollama", "pull", model)
	cmd.Env = append(os.Environ(), "OLLAMA_HOST="+ollamaInternalHost)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	slog.Info("pulling model", "model", model)
	return cmd.Run()
}

// ── NATS: категории ──────────────────────────────────────────────────────────

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

func loadCategoriesOnce(js nats.JetStreamContext, c *categoryCache) bool {
	kv, err := js.KeyValue(kvBucket)
	if err != nil {
		return false
	}
	entry, err := kv.Get(kvKey)
	if err != nil {
		return false
	}
	var cats []category
	if err := json.Unmarshal(entry.Value(), &cats); err != nil {
		slog.Warn("KV value invalid JSON", "error", err)
		return false
	}
	c.set(cats)
	slog.Info("categories loaded", "count", len(cats))
	return true
}

func watchCategories(ctx context.Context, js nats.JetStreamContext, c *categoryCache) {
	for ctx.Err() == nil {
		kv, err := js.KeyValue(kvBucket)
		if err != nil {
			slog.Warn("KV watcher open failed", "error", err)
			time.Sleep(5 * time.Second)
			continue
		}
		watcher, err := kv.WatchAll()
		if err != nil {
			slog.Warn("KV watcher start failed", "error", err)
			time.Sleep(5 * time.Second)
			continue
		}
		slog.Info("watching KV", "bucket", kvBucket)
		for {
			select {
			case <-ctx.Done():
				_ = watcher.Stop()
				return
			case entry, ok := <-watcher.Updates():
				if !ok {
					_ = watcher.Stop()
					goto reopen
				}
				if entry == nil || entry.Key() != kvKey {
					continue
				}
				var cats []category
				if err := json.Unmarshal(entry.Value(), &cats); err != nil {
					slog.Warn("KV update: bad JSON", "error", err)
					continue
				}
				c.set(cats)
				slog.Info("categories updated", "count", len(cats), "revision", entry.Revision())
			}
		}
	reopen:
	}
}

// ── Промпт для LLM ───────────────────────────────────────────────────────────

const systemPrompt = `Проанализируй обращение пациента и верни JSON строго по схеме без markdown и лишнего текста.
{"is_important": bool, "reason": str, "formalized_text": str, "theses": [str], "category": {"id": str, "name": str} | null, "subcategory": {"id": str, "name": str} | null}
is_important=true только если сообщение содержит жалобу на здоровье, условия пребывания, поведение персонала или безопасность. Категорию и подкатегорию выбирай строго из списка в обращении пациента.`

func buildCategoriesBlock(cats []category) string {
	var b strings.Builder
	b.WriteString("Доступные категории инцидентов:\n")
	for _, c := range cats {
		fmt.Fprintf(&b, "- [%s] %s\n", c.ID, c.Name)
		for _, s := range c.Subcategories {
			fmt.Fprintf(&b, "    * [%s] %s\n", s.ID, s.Name)
		}
	}
	return b.String()
}

// ── Вызов Ollama + парсинг ответа ────────────────────────────────────────────

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

func callOllama(ctx context.Context, model, systemPrompt, userPrompt string) (string, error) {
	payload := chatRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Stream: false,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", "http://"+ollamaInternalHost+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ollama status %d: %s", resp.StatusCode, string(b))
	}
	var r chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return "", err
	}
	if len(r.Choices) == 0 {
		return "", fmt.Errorf("empty response from ollama")
	}
	return r.Choices[0].Message.Content, nil
}

// extractJSON — Qwen иногда оборачивает ответ в ```json ... ```. Достаём JSON-объект.
var jsonObjectRE = regexp.MustCompile(`(?s)\{.*\}`)

func extractJSON(text string) string {
	text = strings.TrimSpace(text)
	// Ищем первый самый внешний {...} — жадный regex.
	match := jsonObjectRE.FindString(text)
	if match != "" {
		return match
	}
	return text
}

// ── HTTP-хэндлеры ────────────────────────────────────────────────────────────

func analyzeHandler(c *categoryCache, model string) fiber.Handler {
	return func(ctx *fiber.Ctx) error {
		var req struct {
			Text string `json:"text"`
		}
		if err := ctx.BodyParser(&req); err != nil || strings.TrimSpace(req.Text) == "" {
			return ctx.Status(422).JSON(fiber.Map{"detail": "text must not be empty"})
		}

		cats := c.snapshot()
		userPrompt := fmt.Sprintf("Обращение пациента:\n%s\n\n%s", req.Text, buildCategoriesBlock(cats))

		cctx, cancel := context.WithTimeout(ctx.Context(), analyzeTimeout)
		defer cancel()
		raw, err := callOllama(cctx, model, systemPrompt, userPrompt)
		if err != nil {
			slog.Error("ollama call failed", "error", err)
			return ctx.Status(502).JSON(fiber.Map{"detail": "llm call failed: " + err.Error()})
		}

		jsonStr := extractJSON(raw)
		var result analyzeResponse
		if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
			slog.Warn("LLM returned non-JSON", "raw", raw, "error", err)
			// Fallback: возвращаем текст как formalized + помечаем important.
			return ctx.JSON(analyzeResponse{
				IsImportant:    true,
				Reason:         "LLM returned non-JSON output",
				FormalizedText: req.Text,
				Theses:         []string{},
			})
		}
		// Если Theses пустой, гарантируем не-nil slice в JSON.
		if result.Theses == nil {
			result.Theses = []string{}
		}
		return ctx.JSON(result)
	}
}

func healthHandler(c *categoryCache, nc *nats.Conn) fiber.Handler {
	return func(ctx *fiber.Ctx) error {
		// Пробуем пинг Ollama (GET /)
		client := &http.Client{Timeout: 2 * time.Second}
		ollamaUp := false
		if resp, err := client.Get("http://" + ollamaInternalHost + "/"); err == nil {
			resp.Body.Close()
			ollamaUp = resp.StatusCode == 200
		}
		return ctx.JSON(fiber.Map{
			"status":            "ok",
			"ollama_up":         ollamaUp,
			"nats_connected":    nc != nil && nc.IsConnected(),
			"categories_cached": c.len(),
		})
	}
}

func categoriesHandler(c *categoryCache) fiber.Handler {
	return func(ctx *fiber.Ctx) error {
		return ctx.JSON(fiber.Map{"categories": c.snapshot()})
	}
}

// proxyToOllama — прозрачный прокси /v1/* → Ollama (для benchmark_llm.py и
// прочего OpenAI-совместимого кода).
func proxyToOllama() fiber.Handler {
	return func(ctx *fiber.Ctx) error {
		target := "http://" + ollamaInternalHost + ctx.OriginalURL()
		req, err := http.NewRequestWithContext(ctx.Context(), ctx.Method(), target, bytes.NewReader(ctx.Body()))
		if err != nil {
			return ctx.Status(502).SendString("proxy build failed: " + err.Error())
		}
		ctx.Request().Header.VisitAll(func(k, v []byte) {
			req.Header.Add(string(k), string(v))
		})
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return ctx.Status(502).SendString("proxy call failed: " + err.Error())
		}
		defer resp.Body.Close()
		for k, vs := range resp.Header {
			for _, v := range vs {
				ctx.Response().Header.Add(k, v)
			}
		}
		ctx.Status(resp.StatusCode)
		_, err = io.Copy(ctx.Response().BodyWriter(), resp.Body)
		return err
	}
}

// ── main ─────────────────────────────────────────────────────────────────────

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	model := os.Getenv("OLLAMA_MODEL")
	if model == "" {
		model = "qwen2.5:3b"
	}
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://nats:4222"
	}
	httpAddr := os.Getenv("HTTP_ADDR")
	if httpAddr == "" {
		httpAddr = ":11434"
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 1. Поднимаем Ollama + пулим модель.
	ollamaCmd, err := startOllama(ctx)
	if err != nil {
		log.Fatalf("cannot start ollama: %v", err)
	}
	if err := waitForOllama(ctx); err != nil {
		log.Fatalf("ollama readiness: %v", err)
	}
	present, err := modelPresent(model)
	if err != nil {
		slog.Warn("ollama list failed, trying pull anyway", "error", err)
	}
	if !present {
		if err := pullModel(ctx, model); err != nil {
			log.Fatalf("ollama pull failed: %v", err)
		}
	} else {
		slog.Info("model already present, skipping pull", "model", model)
	}

	// 2. NATS + watcher категорий (не фатально если не доступен — можно стартовать без).
	c := &categoryCache{}
	nc, natsErr := connectNATS(natsURL)
	if natsErr != nil {
		slog.Warn("NATS unavailable, categories disabled", "error", natsErr)
	} else {
		defer nc.Drain()
		js, err := nc.JetStream()
		if err != nil {
			slog.Warn("JetStream unavailable", "error", err)
		} else {
			// Первичная попытка + retry в фоне.
			if !loadCategoriesOnce(js, c) {
				go func() {
					for i := 0; i < 20; i++ {
						time.Sleep(2 * time.Second)
						if loadCategoriesOnce(js, c) {
							return
						}
					}
					slog.Warn("categories never loaded — watcher will pick them up when published")
				}()
			}
			go watchCategories(ctx, js, c)
		}
	}

	// 3. Fiber.
	app := fiber.New(fiber.Config{
		AppName:               "ai-medincident-llm",
		DisableStartupMessage: true,
		ReadTimeout:           analyzeTimeout + 10*time.Second,
		WriteTimeout:          analyzeTimeout + 10*time.Second,
	})

	app.Post("/analyze", analyzeHandler(c, model))
	app.Get("/health", healthHandler(c, nc))
	app.Get("/categories", categoriesHandler(c))

	// Прозрачный прокси OpenAI-compat endpoints — для обратной совместимости.
	app.All("/v1/*", proxyToOllama())
	app.Get("/api/tags", proxyToOllama()) // ollama list

	// Корень: чтобы healthcheck `curl -sf /` (из docker-compose.yml) продолжал работать.
	app.Get("/", func(ctx *fiber.Ctx) error {
		return ctx.SendString("Ollama is running")
	})

	// Graceful shutdown.
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-shutdown
		slog.Info("shutdown signal received")
		cancel()
		_ = app.Shutdown()
		// Убиваем всю группу процессов Ollama.
		if ollamaCmd != nil && ollamaCmd.Process != nil {
			_ = syscall.Kill(-ollamaCmd.Process.Pid, syscall.SIGTERM)
		}
	}()

	slog.Info("HTTP server listening", "addr", httpAddr, "model", model)
	if err := app.Listen(httpAddr); err != nil {
		log.Fatalf("HTTP server failed: %v", err)
	}
}
