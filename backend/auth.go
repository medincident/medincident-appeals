// JWT-валидация access-токенов Zitadel через JWKS (offline, без
// introspect-endpoint — публичный клиент с PKCE не может аутентифицироваться
// против /introspect, да и лишний HTTP-hop на каждый запрос не нужен).
//
// keyfunc сам тянет JWKS с издателя и обновляет его в фоне — нам важно
// только подать ему discovery-URL при старте.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

type Auth struct {
	issuer string
	kf     keyfunc.Keyfunc
}

// NewAuth — поднимает кэш JWKS, дергая {issuer}/oauth/v2/keys.
func NewAuth(ctx context.Context, issuer string) (*Auth, error) {
	if issuer == "" {
		return nil, errors.New("issuer is empty")
	}
	issuer = strings.TrimRight(issuer, "/")
	jwksURL := issuer + "/oauth/v2/keys"

	kf, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("load JWKS from %s: %w", jwksURL, err)
	}
	return &Auth{issuer: issuer, kf: kf}, nil
}

// VerifiedSubject — возвращает `sub` (Zitadel user id) после валидации подписи,
// exp/nbf и issuer. Проверку aud намеренно опускаем: Zitadel выдаёт access_token
// с project-audience, а не клиентским client_id, и фронт/беки могут меняться.
func (a *Auth) VerifiedSubject(r *http.Request) (string, error) {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return "", errors.New("missing Authorization header")
	}
	if !strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return "", errors.New("Authorization must be a Bearer token")
	}
	tokenStr := strings.TrimSpace(auth[len("Bearer "):])

	tok, err := jwt.Parse(
		tokenStr,
		a.kf.Keyfunc,
		jwt.WithIssuer(a.issuer),
		jwt.WithValidMethods([]string{"RS256", "ES256", "RS384", "ES384", "RS512", "ES512"}),
	)
	if err != nil {
		return "", fmt.Errorf("invalid token: %w", err)
	}
	if !tok.Valid {
		return "", errors.New("token not valid")
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("unexpected claims type")
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return "", errors.New("token has no sub claim")
	}
	return sub, nil
}
