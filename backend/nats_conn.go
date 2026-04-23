package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/nats-io/nats.go"
)

const (
	natsConnectRetries = 15
	natsConnectDelay   = 2 * time.Second
)

func connectNATS(ctx context.Context, url string) (*nats.Conn, error) {
	var last error
	for attempt := 1; attempt <= natsConnectRetries; attempt++ {
		nc, err := nats.Connect(url)
		if err == nil {
			slog.Info("connected to NATS", "url", url)
			return nc, nil
		}
		last = err
		slog.Warn("NATS connect failed", "attempt", attempt, "max", natsConnectRetries, "error", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(natsConnectDelay):
		}
	}
	return nil, last
}
