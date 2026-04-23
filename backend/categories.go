package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/nats-io/nats.go"
)

const (
	kvBucket       = "medincident"
	kvKey          = "categories"
	kvLoadAttempts = 20
	kvLoadDelay    = 2 * time.Second
	kvWatcherRetry = 5 * time.Second
)

type Category struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	Description   string        `json:"description,omitempty"`
	Subcategories []Subcategory `json:"subcategories,omitempty"`
}

type Subcategory struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// CategoriesCache держит immutable slice под atomic.Pointer — lock-free чтение.
// Публикатор свопает указатель целиком; читатели всегда видят консистентный снимок.
type CategoriesCache struct {
	ptr atomic.Pointer[[]Category]
}

func (c *CategoriesCache) Store(cats []Category) {
	c.ptr.Store(&cats)
}

func (c *CategoriesCache) Load() []Category {
	if p := c.ptr.Load(); p != nil {
		return *p
	}
	return nil
}

func (c *CategoriesCache) Len() int {
	return len(c.Load())
}

// LoadCategoriesWithRetry — ретраит первичную загрузку, пока categories-service
// не опубликует KV-ключ. При исчерпании попыток продолжит через watcher.
func LoadCategoriesWithRetry(ctx context.Context, js nats.JetStreamContext, c *CategoriesCache) {
	for attempt := 1; attempt <= kvLoadAttempts; attempt++ {
		if tryLoadCategories(js, c) {
			return
		}
		slog.Info("categories not yet available, retrying", "attempt", attempt, "max", kvLoadAttempts)
		select {
		case <-ctx.Done():
			return
		case <-time.After(kvLoadDelay):
		}
	}
	slog.Warn("could not load categories after retries — waiting for KV watcher update")
}

func tryLoadCategories(js nats.JetStreamContext, c *CategoriesCache) bool {
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
	var cats []Category
	if err := json.Unmarshal(entry.Value(), &cats); err != nil {
		slog.Warn("KV value is not valid JSON", "error", err)
		return false
	}
	slog.Info("loaded categories from KV", "count", len(cats), "bucket", kvBucket, "key", kvKey)
	c.Store(cats)
	logCategories(cats)
	return true
}

// WatchCategories бесконечно следит за обновлениями KV, пересоздаёт watcher
// при разрывах. Завершается только по отмене ctx.
func WatchCategories(ctx context.Context, js nats.JetStreamContext, c *CategoriesCache) {
	for ctx.Err() == nil {
		if err := runWatcher(ctx, js, c); err != nil {
			slog.Warn("KV watcher error — reopening", "error", err, "retry_in", kvWatcherRetry)
			select {
			case <-ctx.Done():
				return
			case <-time.After(kvWatcherRetry):
			}
		}
	}
}

func runWatcher(ctx context.Context, js nats.JetStreamContext, c *CategoriesCache) error {
	kv, err := js.KeyValue(kvBucket)
	if err != nil {
		return err
	}
	watcher, err := kv.WatchAll()
	if err != nil {
		return err
	}
	defer watcher.Stop()

	slog.Info("watching KV for updates", "bucket", kvBucket)
	for {
		select {
		case <-ctx.Done():
			return nil
		case entry, ok := <-watcher.Updates():
			if !ok {
				return errors.New("watcher channel closed")
			}
			if entry == nil || entry.Key() != kvKey {
				continue
			}
			var cats []Category
			if err := json.Unmarshal(entry.Value(), &cats); err != nil {
				slog.Warn("KV update: invalid JSON", "error", err)
				continue
			}
			slog.Info("KV update received", "categories", len(cats), "revision", entry.Revision())
			c.Store(cats)
			logCategories(cats)
		}
	}
}

func logCategories(cats []Category) {
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
