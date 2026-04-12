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

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  } else {
    console.warn("[auth-client] No access token. session=%s, error=%s",
      session ? "exists" : "null",
      (session as any)?.error
    );
  }

  config.headers["x-zitadel-orgid"] = env.AUTH_ORG_ID;
  return config;
});
