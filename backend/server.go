package main

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/nats-io/nats.go"
)

const listAppealsTimeout = 10 * time.Second

// NewHTTPServer собирает Fiber-приложение с тремя маршрутами:
//
//	GET /health                        — liveness + статус зависимостей
//	GET /categories                    — кэш категорий (lock-free чтение)
//	GET /users/:userId/appeals         — список обращений пользователя (JWT от Zitadel)
func NewHTTPServer(
	ctx context.Context,
	cache *CategoriesCache,
	store *Store,
	auth *Auth,
	nc *nats.Conn,
	appealsSub *nats.Subscription,
) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName:               "ai-medincident-backend",
		DisableStartupMessage: true,
	})

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":            "ok",
			"categories_cached": cache.Len(),
			"nats_connected":    nc.IsConnected(),
			"appeals_consumer":  appealsSub.IsValid(),
			"auth":              auth != nil,
		})
	})

	app.Get("/categories", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"categories": cache.Load()})
	})

	app.Get("/users/:userId/appeals", func(c *fiber.Ctx) error {
		if auth == nil {
			return c.Status(fiber.StatusServiceUnavailable).
				JSON(fiber.Map{"error": "auth not configured"})
		}
		authHeader := string(c.Request().Header.Peek("Authorization"))
		sub, err := auth.VerifiedSubject(c.UserContext(), authHeader)
		if err != nil {
			slog.Warn("auth failed", "error", err, "path", c.Path())
			return c.Status(fiber.StatusUnauthorized).
				JSON(fiber.Map{"error": "unauthorized"})
		}
		userID := c.Params("userId")
		if userID == "" {
			return c.Status(fiber.StatusBadRequest).
				JSON(fiber.Map{"error": "missing userId"})
		}
		if sub != userID {
			return c.Status(fiber.StatusForbidden).
				JSON(fiber.Map{"error": "cannot access another user's appeals"})
		}

		f := ListFilter{
			UserID:        userID,
			Search:        strings.TrimSpace(c.Query("search")),
			CategoryID:    strings.TrimSpace(c.Query("category")),
			SubcategoryID: strings.TrimSpace(c.Query("subcategory")),
		}
		listCtx, cancel := context.WithTimeout(ctx, listAppealsTimeout)
		defer cancel()
		rows, err := store.List(listCtx, f)
		if err != nil {
			slog.Error("list appeals failed", "user", userID, "error", err)
			return c.Status(fiber.StatusInternalServerError).
				JSON(fiber.Map{"error": "query failed"})
		}
		return c.JSON(fiber.Map{"appeals": rows})
	})

	return app
}
