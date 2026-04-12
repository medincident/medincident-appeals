import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const envConfig = createEnv({
  server: {
    AUTH_APP_URL: z.url(),
    AUTH_ORG_ID: z.string().min(1),
    APP_URL: z.url(),
    AUTH_CLIENT_ID: z.string().min(1),
    AUTH_SECRET: z.string().min(32),

    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },

  client: {
    NEXT_PUBLIC_AUTH_APP_URL: z.url(),
  },

  runtimeEnv: {
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    AUTH_ORG_ID: process.env.AUTH_ORG_ID,
    APP_URL: process.env.APP_URL,
    AUTH_CLIENT_ID: process.env.AUTH_CLIENT_ID,
    AUTH_SECRET: process.env.AUTH_SECRET,

    NEXT_PUBLIC_AUTH_APP_URL: process.env.NEXT_PUBLIC_AUTH_APP_URL,

    NODE_ENV: process.env.NODE_ENV,
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
