// Валидация access-токенов Zitadel через OIDC /userinfo.
//
// Zitadel по умолчанию отдаёт opaque bearer вместо JWT, поэтому вместо
// JWKS-валидатора зовём /oidc/v1/userinfo (он принимает и JWT, и opaque).
// Результаты кэшируем на короткое окно — иначе HTTP-hop на каждом запросе.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type Auth struct {
	issuer      string
	userinfoURL string
	httpClient  *http.Client
	cacheTTL    time.Duration

	mu    sync.Mutex
	cache map[string]authCacheEntry
}

type authCacheEntry struct {
	sub     string
	expires time.Time
}

func NewAuth(_ context.Context, issuer string) (*Auth, error) {
	if issuer == "" {
		return nil, errors.New("issuer is empty")
	}
	issuer = strings.TrimRight(issuer, "/")
	return &Auth{
		issuer:      issuer,
		userinfoURL: issuer + "/oidc/v1/userinfo",
		httpClient:  &http.Client{Timeout: 5 * time.Second},
		cacheTTL:    2 * time.Minute,
		cache:       make(map[string]authCacheEntry),
	}, nil
}

// VerifiedSubject принимает значение заголовка Authorization (сырой "Bearer <token>")
// и возвращает Zitadel sub. При кэш-хите — без сетевого обращения.
func (a *Auth) VerifiedSubject(ctx context.Context, authHeader string) (string, error) {
	if authHeader == "" {
		return "", errors.New("missing Authorization header")
	}
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return "", errors.New("Authorization must be a Bearer token")
	}
	token := strings.TrimSpace(authHeader[len("Bearer "):])
	if token == "" {
		return "", errors.New("empty bearer token")
	}

	if sub, ok := a.cacheGet(token); ok {
		return sub, nil
	}

	sub, err := a.fetchSubject(ctx, token)
	if err != nil {
		return "", err
	}
	a.cachePut(token, sub)
	return sub, nil
}

func (a *Auth) cacheGet(token string) (string, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	e, ok := a.cache[token]
	if !ok {
		return "", false
	}
	if time.Now().After(e.expires) {
		delete(a.cache, token)
		return "", false
	}
	return e.sub, true
}

func (a *Auth) cachePut(token, sub string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	// Простейший ограничитель роста: один процесс, токены ~2KB, 10k ≈ <20MB.
	if len(a.cache) > 10_000 {
		for k := range a.cache {
			delete(a.cache, k)
			break
		}
	}
	a.cache[token] = authCacheEntry{sub: sub, expires: time.Now().Add(a.cacheTTL)}
}

func (a *Auth) fetchSubject(ctx context.Context, token string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.userinfoURL, nil)
	if err != nil {
		return "", fmt.Errorf("build userinfo request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("userinfo request failed: %w", err)
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusUnauthorized:
		return "", errors.New("userinfo: token rejected")
	case resp.StatusCode != http.StatusOK:
		return "", fmt.Errorf("userinfo returned %d", resp.StatusCode)
	}

	var info struct {
		Sub string `json:"sub"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", fmt.Errorf("decode userinfo: %w", err)
	}
	if info.Sub == "" {
		return "", errors.New("userinfo returned no sub")
	}
	return info.Sub, nil
}
