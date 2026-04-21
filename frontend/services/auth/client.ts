"server only";

import axios from "axios";
import { auth } from "./auth";
import { env } from "@/shared/config/env";

export const userApi = axios.create({
  baseURL: env.AUTH_APP_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

userApi.interceptors.request.use(async (config) => {
  const session = await auth();
  const accessToken = (session as any)?.accessToken as string | undefined;
  const sessionError = (session as any)?.error as string | undefined;

  if (sessionError === "RefreshAccessTokenError") {
    // Refresh упал — следующий запрос к Zitadel всё равно вернёт AUTH-7fs1e.
    // Бросаем понятную ошибку наверх, чтобы страница перенаправила на /login.
    throw new Error("AUTH_REFRESH_FAILED");
  }

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  } else {
    console.warn("[auth-client] No access token. session=%s, error=%s",
      session ? "exists" : "null",
      sessionError,
    );
  }

  config.headers["x-zitadel-orgid"] = env.AUTH_ORG_ID;
  return config;
});

userApi.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const code = typeof data === "object" && data ? data?.code ?? data?.details?.[0]?.type : undefined;
    if (status === 401 || String(data?.message ?? "").includes("AUTH-7fs1e")) {
      console.warn("[auth-client] Zitadel rejected token (AUTH-7fs1e). Token was cached as valid but server disagrees. Check Zitadel access_token_lifetime vs our expiresAt.", { status, code });
    }
    return Promise.reject(err);
  },
);
