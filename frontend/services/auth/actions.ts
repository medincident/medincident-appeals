"use server";

import { redirect } from "next/navigation";
import { env } from "@/shared/config/env";
import { signIn, signOut } from "./auth";

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
  await signOut({ redirectTo: "/login" });
}

export async function loginAction(callbackUrl?: string): Promise<void> {
  await signIn("zitadel", { redirectTo: callbackUrl ?? "/" });
}
