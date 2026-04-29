import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import ZitadelProvider from "next-auth/providers/zitadel";

import { env } from "@/shared/config/env";
import { safeError } from "@/lib/log";

import { SessionErrorCode } from "./errors";
import "./types";

const OIDC_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "urn:zitadel:iam:org:project:id:zitadel:aud",
].join(" ");

// Жёсткий потолок «времени жизни» хранимого expiresAt. Refresh — единственная
// проверка авторизации (userinfo на каждом запросе мы не дёргаем)
const ACCESS_TOKEN_MAX_AGE_MS = env.AUTH_REFRESH_CAP_SEC * 1000;

function boundExpiresAt(raw: number | undefined): number {
  const ceil = Date.now() + ACCESS_TOKEN_MAX_AGE_MS;
  if (!raw || !Number.isFinite(raw)) return ceil;
  return Math.min(raw, ceil);
}

interface RefreshState {
  inflight: Map<string, Promise<JWT>>;
  byInputRT: Map<string, { result: JWT; at: number }>;
  byUserId: Map<string, { result: JWT; at: number }>;
}

const REFRESH_STATE_KEY = Symbol.for("ai-medincident.frontend.auth.refreshState");
type GlobalWithRefreshState = typeof globalThis & {
  [REFRESH_STATE_KEY]?: RefreshState;
};

const refreshState: RefreshState = ((globalThis as GlobalWithRefreshState)[
  REFRESH_STATE_KEY
] ??= {
  inflight: new Map(),
  byInputRT: new Map(),
  byUserId: new Map(),
});

const RECENT_TTL_MS = 30_000;

function isFresh(at: number): boolean {
  return Date.now() - at < RECENT_TTL_MS;
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  const refreshToken = token.refreshToken;
  if (!refreshToken) {
    return { ...token, error: SessionErrorCode.RefreshAccessTokenError };
  }

  const cachedByRT = refreshState.byInputRT.get(refreshToken);
  if (cachedByRT && isFresh(cachedByRT.at)) {
    return cachedByRT.result;
  }

  const inflight = refreshState.inflight.get(refreshToken);
  if (inflight) {
    return inflight;
  }

  const promise = doRefresh(token, refreshToken).then((result) => {
    if (!result.error) {
      const stamped = { result, at: Date.now() };
      refreshState.byInputRT.set(refreshToken, stamped);
      if (token.userId) refreshState.byUserId.set(token.userId, stamped);
      setTimeout(() => {
        const e = refreshState.byInputRT.get(refreshToken);
        if (e === stamped) refreshState.byInputRT.delete(refreshToken);
      }, RECENT_TTL_MS).unref?.();
    }
    return result;
  }).finally(() => {
    refreshState.inflight.delete(refreshToken);
  });

  refreshState.inflight.set(refreshToken, promise);
  return promise;
}

async function doRefresh(token: JWT, refreshToken: string): Promise<JWT> {
  let response: Response;
  try {
    response = await fetch(`${env.AUTH_APP_URL}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.AUTH_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
  } catch (err) {
    console.error("[auth][refresh] network error:", safeError(err));
    return failOrFallback(token);
  }

  let body: Record<string, unknown>;
  try {
    body = await response.json();
  } catch (err) {
    console.error(`[auth][refresh] non-JSON response (${response.status}):`, safeError(err));
    return failOrFallback(token);
  }

  if (!response.ok) {
    const code = typeof body.error === "string" ? body.error : "unknown";
    console.error(`[auth][refresh] failed status=${response.status} code=${code}`);
    return failOrFallback(token);
  }

  const accessToken = typeof body.access_token === "string" ? body.access_token : undefined;
  const newRefreshToken =
    typeof body.refresh_token === "string" ? body.refresh_token : undefined;
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : undefined;

  return {
    ...token,
    accessToken,
    expiresAt: boundExpiresAt(expiresIn ? Date.now() + expiresIn * 1000 : undefined),
    refreshToken: newRefreshToken ?? refreshToken,
    error: undefined,
  };
}

// Защищает от cookie last-write-wins: параллельный callback, проигравший гонку
// ротации, не должен затирать рабочую сессию ошибкой.
function failOrFallback(token: JWT): JWT {
  const userId = token.userId;
  if (userId) {
    const cached = refreshState.byUserId.get(userId);
    if (cached && isFresh(cached.at)) {
      return cached.result;
    }
  }
  return { ...token, error: SessionErrorCode.RefreshAccessTokenError };
}

const useSecureCookies = env.APP_URL.startsWith("https://");

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: "/api/auth",
  trustHost: true,
  cookies: {
    pkceCodeVerifier: {
      name: `${useSecureCookies ? "__Secure-" : ""}authjs.pkce.code_verifier`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies, maxAge: 60 * 15 },
    },
    state: {
      name: `${useSecureCookies ? "__Secure-" : ""}authjs.state`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies, maxAge: 60 * 15 },
    },
    nonce: {
      name: `${useSecureCookies ? "__Secure-" : ""}authjs.nonce`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies, maxAge: 60 * 15 },
    },
  },
  providers: [
    ZitadelProvider({
      clientId: env.AUTH_CLIENT_ID,
      issuer: env.AUTH_APP_URL,
      checks: ["pkce", "state", "nonce"],
      client: { token_endpoint_auth_method: "none" },
      authorization: { params: { scope: OIDC_SCOPES } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          userId: account.providerAccountId,
          expiresAt: boundExpiresAt(
            account.expires_at ? account.expires_at * 1000 : undefined,
          ),
          refreshToken: account.refresh_token,
        };
      }

      const remaining = (token.expiresAt ?? 0) - Date.now();
      const needsRefresh = remaining <= 0 || remaining > ACCESS_TOKEN_MAX_AGE_MS + 30_000;
      if (!needsRefresh) return token;

      if (!token.refreshToken) {
        return { ...token, error: SessionErrorCode.RefreshAccessTokenError };
      }

      return refreshAccessToken(token);
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken;
      // AdapterSession.userId типизирован как обязательный string —
      // присваиваем только при наличии, чтобы не сужать тип до never.
      if (token.userId) session.userId = token.userId;
      session.error = token.error;
      session.expiresAt = token.expiresAt;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/error",
  },
});
