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
      expiresAt: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
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
        return {
          ...token,
          accessToken: account.access_token,
          userId: account.providerAccountId,
          expiresAt: account.expires_at ? account.expires_at * 1000 : Date.now() + 12 * 60 * 60 * 1000,
          refreshToken: account.refresh_token,
        };
      }

      if (Date.now() < (token.expiresAt as number) - 60 * 1000) return token;

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
