// ai-medincident-backend — потребитель JetStream (appeals.submit),
// REST-фасад для фронта и кэш категорий из NATS KV.
package main

import (
	"context"
	"log"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const shutdownTimeout = 10 * time.Second

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	slog.Info("starting ai-medincident-backend")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	store, err := NewStore(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres init: %v", err)
	}
	defer store.Close()
	slog.Info("postgres ready")

	var authVerifier *Auth
	if cfg.ZitadelIssuer != "" {
		authVerifier, err = NewAuth(ctx, cfg.ZitadelIssuer)
		if err != nil {
			log.Fatalf("JWT verifier init: %v", err)
		}
		slog.Info("Zitadel auth ready", "issuer", cfg.ZitadelIssuer)
	} else {
		slog.Warn("ZITADEL_ISSUER not set — REST /users/:id/appeals will return 503")
	}

	nc, err := connectNATS(ctx, cfg.NATSURL)
	if err != nil {
		log.Fatalf("cannot connect to NATS: %v", err)
	}
	defer nc.Drain()

	js, err := nc.JetStream()
	if err != nil {
		log.Fatalf("cannot access JetStream: %v", err)
	}

	cats := &CategoriesCache{}
	LoadCategoriesWithRetry(ctx, js, cats)
	go WatchCategories(ctx, js, cats)

	if err := EnsureAppealsStream(js); err != nil {
		log.Fatalf("ensure appeals stream: %v", err)
	}

	nlp := NewNLPClient(cfg.NLPURL)
	processor := NewAppealsProcessor(nc, js, store, nlp)
	appealsSub, err := processor.Subscribe(ctx)
	if err != nil {
		log.Fatalf("start appeals consumer: %v", err)
	}

	app := NewHTTPServer(ctx, cats, store, authVerifier, nc, appealsSub)

	go func() {
		<-ctx.Done()
		slog.Info("shutdown signal received")
		_ = appealsSub.Drain()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		_ = app.ShutdownWithContext(shutdownCtx)
	}()

	slog.Info("HTTP server listening", "addr", cfg.HTTPAddr, "nlp_url", cfg.NLPURL)
	if err := app.Listen(cfg.HTTPAddr); err != nil {
		log.Fatalf("HTTP server failed: %v", err)
	}
}
