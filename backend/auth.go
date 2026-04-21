// Валидация access-токенов Zitadel через OIDC /userinfo.
//
// Раньше здесь был оффлайн JWT-валидатор (JWKS + keyfunc). Он подходит, если
// Zitadel настроен отдавать JWT-access_token, но дефолтное поведение — opaque
// bearer, и тогда jwt.Parse ругается «token contains an invalid number of
// segments». Чтобы не завязываться на конфиг Zitadel, валидируем токен
// через /oidc/v1/userinfo: endpoint принимает и JWT, и opaque, возвращает sub.
// Результаты кэшируем на короткое окно, иначе был бы HTTP-hop на каждый запрос.
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

// VerifiedSubject — возвращает `sub` (Zitadel user id). Кэш исключает сетевой
// round-trip на каждом запросе; при промахе — идём в /userinfo с тем же
// Bearer, что прислал клиент.
func (a *Auth) VerifiedSubject(r *http.Request) (string, error) {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return "", errors.New("missing Authorization header")
	}
	if !strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return "", errors.New("Authorization must be a Bearer token")
	}
	token := strings.TrimSpace(auth[len("Bearer "):])
	if token == "" {
		return "", errors.New("empty bearer token")
	}

	if sub, ok := a.cacheGet(token); ok {
		return sub, nil
	}

	sub, err := a.fetchSubject(r.Context(), token)
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
	// Простейший ограничитель роста — кэш для единственного процесса,
	// токены небольшие (<2KB), 10k записей это <20MB. На практике записей
	// столько, сколько одновременно активных сессий.
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

	if resp.StatusCode == http.StatusUnauthorized {
		return "", errors.New("userinfo: token rejected")
	}
	if resp.StatusCode != http.StatusOK {
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
