package main

import (
	"cmp"
	"errors"
	"os"
)

type Config struct {
	NATSURL       string
	NLPURL        string
	HTTPAddr      string
	DatabaseURL   string
	ZitadelIssuer string
}

func LoadConfig() (Config, error) {
	cfg := Config{
		NATSURL:       cmp.Or(os.Getenv("NATS_URL"), "nats://nats:4222"),
		NLPURL:        cmp.Or(os.Getenv("NLP_SERVICE_URL"), "http://nlp-service:8000"),
		HTTPAddr:      cmp.Or(os.Getenv("HTTP_ADDR"), ":8080"),
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		ZitadelIssuer: os.Getenv("ZITADEL_ISSUER"),
	}
	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}
	return cfg, nil
}
