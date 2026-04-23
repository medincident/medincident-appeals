// Orchestration of appeals:
//
//	submit (JetStream) → nlp-service /analyze → Postgres upsert → result publish → ack.
//
// Порядок важен: если Postgres падает — не публикуем "готово" и не ack'аем,
// сообщение придёт повторно из JetStream.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/nats-io/nats.go"
)

const (
	appealsStream     = "APPEALS"
	appealsSubmitSubj = "appeals.submit"
	appealsResultSubj = "appeals.result.*"
	appealsDurable    = "appeals-backend"
	appealsQueue      = "appeals-workers"
	appealsAckWait    = 60 * time.Second
	appealsMaxDeliver = 5
	appealsMaxAge     = 7 * 24 * time.Hour
	dbSaveTimeout     = 5 * time.Second
)

type AppealSubmit struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	UserID    string `json:"user_id,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
}

type AppealResult struct {
	ID string `json:"id"`
	NLPAnalyzeResponse
}

type AppealError struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

// EnsureAppealsStream идемпотентно создаёт/обновляет стрим APPEALS.
// File storage — чтобы сообщения переживали рестарт NATS.
func EnsureAppealsStream(js nats.JetStreamContext) error {
	cfg := &nats.StreamConfig{
		Name:      appealsStream,
		Subjects:  []string{appealsSubmitSubj, appealsResultSubj},
		Storage:   nats.FileStorage,
		Retention: nats.LimitsPolicy,
		MaxAge:    appealsMaxAge,
		Replicas:  1,
	}
	if _, err := js.StreamInfo(appealsStream); err == nil {
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

type AppealsProcessor struct {
	nc    *nats.Conn
	js    nats.JetStreamContext
	store *Store
	nlp   *NLPClient
}

func NewAppealsProcessor(nc *nats.Conn, js nats.JetStreamContext, store *Store, nlp *NLPClient) *AppealsProcessor {
	return &AppealsProcessor{nc: nc, js: js, store: store, nlp: nlp}
}

// Subscribe запускает durable queue-подписку. QueueSubscribe + Durable =
// пул воркеров, переживающий рестарты.
func (p *AppealsProcessor) Subscribe(ctx context.Context) (*nats.Subscription, error) {
	sub, err := p.js.QueueSubscribe(
		appealsSubmitSubj,
		appealsQueue,
		func(m *nats.Msg) { p.handle(ctx, m) },
		nats.BindStream(appealsStream),
		nats.Durable(appealsDurable),
		nats.ManualAck(),
		nats.AckWait(appealsAckWait),
		nats.MaxDeliver(appealsMaxDeliver),
		nats.DeliverAll(),
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

func (p *AppealsProcessor) handle(ctx context.Context, m *nats.Msg) {
	var req AppealSubmit
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

	var deliveryNum uint64
	if md, _ := m.Metadata(); md != nil {
		deliveryNum = md.NumDelivered
	}
	slog.Info("processing appeal",
		"id", req.ID,
		"user_id", req.UserID,
		"chars", len(req.Text),
		"delivery", deliveryNum)

	resultSubj := "appeals.result." + req.ID

	resp, err := p.nlp.Analyze(ctx, req.Text)
	if err != nil {
		slog.Error("nlp-service call failed", "id", req.ID, "error", err)
		errPayload, _ := json.Marshal(AppealError{ID: req.ID, Error: err.Error()})
		if pubErr := p.nc.Publish(resultSubj, errPayload); pubErr != nil {
			slog.Error("publish error result failed", "id", req.ID, "error", pubErr)
		}
		_ = m.NakWithDelay(5 * time.Second)
		return
	}

	switch {
	case p.store != nil && req.UserID != "":
		row := buildAppealRow(req, resp)
		dbCtx, cancel := context.WithTimeout(ctx, dbSaveTimeout)
		err := p.store.Save(dbCtx, row)
		cancel()
		if err != nil {
			slog.Error("postgres save failed, will retry", "id", req.ID, "error", err)
			_ = m.NakWithDelay(3 * time.Second)
			return
		}
	case req.UserID == "":
		slog.Warn("appeal without user_id — not persisting to DB", "id", req.ID)
	}

	payload, err := json.Marshal(AppealResult{ID: req.ID, NLPAnalyzeResponse: *resp})
	if err != nil {
		slog.Error("marshal result failed", "id", req.ID, "error", err)
		_ = m.Term()
		return
	}
	if _, err := p.js.Publish(resultSubj, payload, nats.MsgId("result-"+req.ID)); err != nil {
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

func buildAppealRow(req AppealSubmit, resp *NLPAnalyzeResponse) AppealRow {
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

func makeSummary(text string, max int) string {
	s := strings.Join(strings.Fields(text), " ")
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max-1]) + "…"
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
