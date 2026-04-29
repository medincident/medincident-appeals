import "server-only";

import axios from "axios";

import { env } from "@/shared/config/env";

import { auth } from "./auth";
import { AuthError, AuthErrorCode, SessionErrorCode } from "./errors";

export const userApi = axios.create({
  baseURL: env.AUTH_APP_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

userApi.interceptors.request.use(async (config) => {
  const session = await auth();

  if (session?.error === SessionErrorCode.RefreshAccessTokenError) {
    throw new AuthError(AuthErrorCode.RefreshFailed);
  }

  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }

  config.headers["x-zitadel-orgid"] = env.AUTH_ORG_ID;
  return config;
});

userApi.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    const data = err?.response?.data;
    if (status === 401 || String(data?.message ?? "").includes("AUTH-7fs1e")) {
      console.warn("[auth-client] Zitadel rejected token", { status });
    }
    return Promise.reject(err);
  },
);
