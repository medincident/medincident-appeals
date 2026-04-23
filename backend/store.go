// Postgres-хранилище обработанных обращений.
// Одна таблица `appeals`: строка = один инцидент, обработанный NLP. user_id —
// Zitadel sub, по нему фильтруется REST. Category/subcategory денормализованы
// (id+name) — в списке не ходим в справочник, имя фиксируется на момент обработки.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	dbConnectAttempts = 20
	dbConnectDelay    = 2 * time.Second
	dbMaxConns        = 10
	defaultListLimit  = 200
	maxListLimit      = 500
)

const schemaSQL = `
CREATE TABLE IF NOT EXISTS appeals (
    id                   UUID         PRIMARY KEY,
    user_id              TEXT         NOT NULL,
    text                 TEXT         NOT NULL,
    summary              TEXT         NOT NULL DEFAULT '',
    formalized_text      TEXT         NOT NULL DEFAULT '',
    is_important         BOOLEAN      NOT NULL DEFAULT TRUE,
    important_confidence REAL,
    reason               TEXT         NOT NULL DEFAULT '',
    theses               JSONB        NOT NULL DEFAULT '[]'::jsonb,
    category_id          TEXT,
    category_name        TEXT,
    subcategory_id       TEXT,
    subcategory_name     TEXT,
    status               TEXT         NOT NULL DEFAULT 'processed',
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appeals_user_created_idx
    ON appeals(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS appeals_user_category_idx
    ON appeals(user_id, category_id);
`

type AppealRow struct {
	ID                  string    `json:"id"`
	UserID              string    `json:"user_id"`
	Text                string    `json:"text"`
	Summary             string    `json:"summary"`
	FormalizedText      string    `json:"formalized_text"`
	IsImportant         bool      `json:"is_important"`
	ImportantConfidence *float64  `json:"important_confidence,omitempty"`
	Reason              string    `json:"reason"`
	Theses              []string  `json:"theses"`
	CategoryID          *string   `json:"category_id,omitempty"`
	CategoryName        *string   `json:"category_name,omitempty"`
	SubcategoryID       *string   `json:"subcategory_id,omitempty"`
	SubcategoryName     *string   `json:"subcategory_name,omitempty"`
	Status              string    `json:"status"`
	CreatedAt           time.Time `json:"created_at"`
}

type ListFilter struct {
	UserID        string
	Search        string
	CategoryID    string
	SubcategoryID string
	Limit         int
}

type Store struct {
	pool *pgxpool.Pool
}

// NewStore открывает пул и накатывает миграцию. Ретраит первый connect —
// Postgres может быть не готов в момент старта даже с healthcheck.
func NewStore(ctx context.Context, dsn string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = dbMaxConns

	var pool *pgxpool.Pool
	for range dbConnectAttempts {
		pool, err = pgxpool.NewWithConfig(ctx, cfg)
		if err == nil {
			if err = pool.Ping(ctx); err == nil {
				break
			}
			pool.Close()
			pool = nil
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(dbConnectDelay):
		}
	}
	if pool == nil {
		return nil, fmt.Errorf("postgres not reachable: %w", err)
	}

	if _, err := pool.Exec(ctx, schemaSQL); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	if s != nil && s.pool != nil {
		s.pool.Close()
	}
}

// Save — upsert по id. Повторная доставка сообщения до ack перезапишет
// свежими NLP-результатами, не сломав уникальность.
func (s *Store) Save(ctx context.Context, r AppealRow) error {
	theses, err := json.Marshal(r.Theses)
	if err != nil {
		return fmt.Errorf("marshal theses: %w", err)
	}
	const q = `
        INSERT INTO appeals (
            id, user_id, text, summary, formalized_text, is_important,
            important_confidence, reason, theses,
            category_id, category_name, subcategory_id, subcategory_name,
            status, created_at
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, COALESCE($15, NOW())
        )
        ON CONFLICT (id) DO UPDATE SET
            summary              = EXCLUDED.summary,
            formalized_text      = EXCLUDED.formalized_text,
            is_important         = EXCLUDED.is_important,
            important_confidence = EXCLUDED.important_confidence,
            reason               = EXCLUDED.reason,
            theses               = EXCLUDED.theses,
            category_id          = EXCLUDED.category_id,
            category_name        = EXCLUDED.category_name,
            subcategory_id       = EXCLUDED.subcategory_id,
            subcategory_name     = EXCLUDED.subcategory_name,
            status               = EXCLUDED.status
    `
	var createdAt *time.Time
	if !r.CreatedAt.IsZero() {
		createdAt = &r.CreatedAt
	}
	_, err = s.pool.Exec(ctx, q,
		r.ID, r.UserID, r.Text, r.Summary, r.FormalizedText, r.IsImportant,
		r.ImportantConfidence, r.Reason, theses,
		r.CategoryID, r.CategoryName, r.SubcategoryID, r.SubcategoryName,
		r.Status, createdAt,
	)
	return err
}

// List — обращения пользователя с ILIKE-поиском и фильтрами по category/subcategory.
// Для диплома хватит; при росте объёма — заменить на tsvector + GIN.
func (s *Store) List(ctx context.Context, f ListFilter) ([]AppealRow, error) {
	if f.UserID == "" {
		return nil, errors.New("user_id required")
	}
	if f.Limit <= 0 || f.Limit > maxListLimit {
		f.Limit = defaultListLimit
	}

	args := []any{f.UserID}
	where := []string{"user_id = $1"}

	if f.Search != "" {
		args = append(args, "%"+f.Search+"%")
		where = append(where, fmt.Sprintf(
			"(text ILIKE $%d OR formalized_text ILIKE $%d OR reason ILIKE $%d)",
			len(args), len(args), len(args),
		))
	}
	if f.CategoryID != "" {
		args = append(args, f.CategoryID)
		where = append(where, fmt.Sprintf("category_id = $%d", len(args)))
	}
	if f.SubcategoryID != "" {
		args = append(args, f.SubcategoryID)
		where = append(where, fmt.Sprintf("subcategory_id = $%d", len(args)))
	}

	args = append(args, f.Limit)
	q := fmt.Sprintf(`
        SELECT id, user_id, text, summary, formalized_text, is_important,
               important_confidence, reason, theses,
               category_id, category_name, subcategory_id, subcategory_name,
               status, created_at
        FROM appeals
        WHERE %s
        ORDER BY created_at DESC
        LIMIT $%d
    `, strings.Join(where, " AND "), len(args))

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]AppealRow, 0, 16)
	for rows.Next() {
		var r AppealRow
		var thesesRaw []byte
		if err := rows.Scan(
			&r.ID, &r.UserID, &r.Text, &r.Summary, &r.FormalizedText, &r.IsImportant,
			&r.ImportantConfidence, &r.Reason, &thesesRaw,
			&r.CategoryID, &r.CategoryName, &r.SubcategoryID, &r.SubcategoryName,
			&r.Status, &r.CreatedAt,
		); err != nil {
			return nil, err
		}
		if len(thesesRaw) > 0 {
			if err := json.Unmarshal(thesesRaw, &r.Theses); err != nil {
				r.Theses = []string{}
			}
		}
		if r.Theses == nil {
			r.Theses = []string{}
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
