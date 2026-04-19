// ai-medincident-backend — подключается к NATS JetStream KV, кэширует категории
// и отдаёт их через HTTP. Следит за изменениями ключа, обновляет кэш онлайн.
package main

import (
	"context"
	"encoding/json"
	"log"
	"log/slog"
	"os"
	"os/signal"
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

func main() {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://nats:4222"
	}
	httpAddr := os.Getenv("HTTP_ADDR")
	if httpAddr == "" {
		httpAddr = ":8080"
	}

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	slog.Info("starting ai-medincident-backend")

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

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go watchKV(ctx, js, c)

	app := fiber.New(fiber.Config{
		AppName:               "ai-medincident-backend",
		DisableStartupMessage: true,
	})

	app.Get("/health", func(ctx *fiber.Ctx) error {
		return ctx.JSON(fiber.Map{
			"status":            "ok",
			"categories_cached": c.len(),
			"nats_connected":    nc.IsConnected(),
		})
	})

	app.Get("/categories", func(ctx *fiber.Ctx) error {
		return ctx.JSON(fiber.Map{"categories": c.snapshot()})
	})

	// Graceful shutdown по SIGTERM/SIGINT.
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-shutdown
		slog.Info("shutdown signal received")
		cancel()
		_ = app.Shutdown()
	}()

	slog.Info("HTTP server listening", "addr", httpAddr)
	if err := app.Listen(httpAddr); err != nil {
		log.Fatalf("HTTP server failed: %v", err)
	}
}
