"use server";

import { redirect } from "next/navigation";

import { env } from "@/shared/config/env";
import { safeError } from "@/lib/log";

import { auth, signIn, signOut } from "./auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8080";

async function revokeOnBackend(): Promise<void> {
  const session = await auth();
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

// Пользовательский logout. Уходит через Zitadel /oidc/v1/end_session;
// post_logout_redirect_uri должен побайтово совпадать с Post Logout URIs
// в приложении Zitadel.
// https://openid.net/specs/openid-connect-rpinitiated-1_0.html
export async function logoutAction(): Promise<void> {
  await revokeOnBackend();
  await signOut({ redirect: false });

  const params = new URLSearchParams({
    client_id: env.AUTH_CLIENT_ID,
    post_logout_redirect_uri: `${env.APP_URL}/logout`,
  });
  redirect(`${env.AUTH_APP_URL}/oidc/v1/end_session?${params}`);
}

// Logout при упавшем refresh: end_session дёргать бесполезно, OIDC-сессия
// в Zitadel уже мертва — достаточно снести локальную куку.
export async function localLogoutAction(): Promise<void> {
  await revokeOnBackend();
  await signOut({ redirectTo: "/login" });
}

export async function loginAction(callbackUrl?: string): Promise<void> {
  await signIn("zitadel", { redirectTo: callbackUrl ?? "/" });
}
