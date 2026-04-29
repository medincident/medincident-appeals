import type { SessionErrorCode } from "./errors";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    userId?: string;
    error?: SessionErrorCode;
    expiresAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    userId?: string;
    error?: SessionErrorCode;
  }
}
