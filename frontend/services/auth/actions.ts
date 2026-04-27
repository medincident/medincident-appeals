"use server";

import { redirect } from "next/navigation";
import { env } from "@/shared/config/env";
import { safeError } from "@/lib/log";
import { auth, signIn, signOut } from "./auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8080";

interface SessionLike { accessToken?: string }

/**
 * Бэкенд держит in-memory blacklist отозванных токенов (см. TokenBlacklist).
 * Дёргаем POST /api/v1/auth/logout до снос куки, чтобы access-token,
 * который ещё живёт в Zitadel TTL, не принимался нашим API.
 */
async function revokeOnBackend(): Promise<void> {
  const session = (await auth()) as unknown as SessionLike | null;
  const token = session?.accessToken;
  if (!token) return;
  try {
    await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.warn("[auth] backend revoke failed:", safeError(err));
  }
}

// MissingCSRF при client-side signOut обходится через Server Action — у него
// собственная защита через Next.js (origin check), CSRF-cookie Auth.js не нужен.

/**
 * Пользовательский logout (кнопка "Выйти"). Сносит NextAuth-куку и уводит
 * через Zitadel `/oidc/v1/end_session`, чтобы OIDC-сессия на IdP тоже
 * завершилась. post_logout_redirect_uri должен побайтово совпадать с
 * Post Logout URIs приложения в Zitadel.
 * Spec: https://openid.net/specs/openid-connect-rpinitiated-1_0.html
 */
export async function logoutAction(): Promise<void> {
  await revokeOnBackend();
  await signOut({ redirect: false });

  const params = new URLSearchParams({
    client_id: env.AUTH_CLIENT_ID,
    post_logout_redirect_uri: `${env.APP_URL}/logout`,
  });
  redirect(`${env.AUTH_APP_URL}/oidc/v1/end_session?${params}`);
}

/**
 * Локальный logout для SessionGuard: refresh токена упал → Zitadel уже
 * прикончил OIDC-сессию. Дёргать end_session в этой точке бесполезно
 * (получим invalid_request), достаточно снести NextAuth-куку.
 */
export async function localLogoutAction(): Promise<void> {
  await revokeOnBackend();
  await signOut({ redirectTo: "/login" });
}

export async function loginAction(callbackUrl?: string): Promise<void> {
  await signIn("zitadel", { redirectTo: callbackUrl ?? "/" });
}
