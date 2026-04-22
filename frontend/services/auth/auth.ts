import NextAuth from "next-auth";
import ZitadelProvider from "next-auth/providers/zitadel";
import { env } from "@/shared/config/env";

const OIDC_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "urn:zitadel:iam:org:project:id:zitadel:aud",
].join(" ");

// Жёсткий потолок для хранимого expiresAt. Refresh — единственная «настоящая»
// проверка авторизации у нас (userinfo мы НЕ дёргаем на каждом запросе),
// поэтому гарантируем, что он вызывается не реже чем раз в ACCESS_TOKEN_MAX_AGE.
// Если Zitadel отвечает, что токен живёт дольше — всё равно обновим раньше;
// если короче — используем его срок.
const ACCESS_TOKEN_MAX_AGE_MS = 5 * 60 * 1000;

function boundExpiresAt(raw: number | undefined): number {
  const ceil = Date.now() + ACCESS_TOKEN_MAX_AGE_MS;
  if (!raw || !Number.isFinite(raw)) return ceil;
  return Math.min(raw, ceil);
}

async function refreshAccessToken(token: any) {
  try {
    const response = await fetch(`${env.AUTH_APP_URL}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.AUTH_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
        scope: OIDC_SCOPES,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) throw refreshedTokens;

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      expiresAt: boundExpiresAt(
        refreshedTokens.expires_in ? Date.now() + refreshedTokens.expires_in * 1000 : undefined,
      ),
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("[auth] Token refresh failed:", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
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
        if (!account.refresh_token) {
          console.warn("[auth] Zitadel did not return refresh_token — offline_access scope missing or denied");
        }
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

      // Проверка авторизации = рефреш. Рефрешимся, если:
      //  1) expiresAt уже прошёл — токен протух;
      //  2) expiresAt далеко за пределами нашего cap — старая сессия с
      //     устаревшим «оптимистичным» expiresAt; уронить её до cap нельзя
      //     без знания момента выдачи, поэтому просто дёргаем refresh.
      const now = Date.now();
      const remaining = (token.expiresAt as number) - now;
      const needsRefresh = remaining <= 0 || remaining > ACCESS_TOKEN_MAX_AGE_MS + 30_000;
      if (!needsRefresh) return token;

      if (!token.refreshToken) {
        console.warn("[auth] token expired but no refreshToken available — user will be signed out");
        return { ...token, error: "RefreshAccessTokenError" };
      }

      return await refreshAccessToken(token);
    },

    async session({ session, token }) {
      if (token) {
        // @ts-ignore
        session.accessToken = token.accessToken;
        // @ts-ignore
        session.userId = token.userId;
        // @ts-ignore
        session.error = token.error;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/error",
  },
});
