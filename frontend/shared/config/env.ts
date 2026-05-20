import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const WebAppForceSchema = z.enum(["off", "telegram", "vk", "max"]).default("off");

const envConfig = createEnv({
  server: {
    AUTH_APP_URL: z.url().default("http://localhost:8080"),
    AUTH_ORG_ID: z.string().min(1).default("123456789"),
    APP_URL: z.url().default("http://localhost:8080"),
    AUTH_CLIENT_ID: z.string().min(1).default("123456789"),
    AUTH_SECRET: z.string().min(32).default("placeholder_secret_at_least_32_chars_long"),

    // Настройка времени жизни access-токена (секунды).
    AUTH_REFRESH_CAP_SEC: z.coerce.number().int().min(15).max(3600).default(60),

    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },

  client: {
    NEXT_PUBLIC_WEBAPP_FORCE: WebAppForceSchema,
  },

  runtimeEnv: {
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    AUTH_ORG_ID: process.env.AUTH_ORG_ID,
    APP_URL: process.env.APP_URL,
    AUTH_CLIENT_ID: process.env.AUTH_CLIENT_ID,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_REFRESH_CAP_SEC: process.env.AUTH_REFRESH_CAP_SEC,

    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_WEBAPP_FORCE: process.env.NEXT_PUBLIC_WEBAPP_FORCE,
  },
});

export const env = {
  ...envConfig,

  get isDev(): boolean {
    return envConfig.NODE_ENV === "development";
  },
  get isProd(): boolean {
    return envConfig.NODE_ENV === "production";
  },
};
