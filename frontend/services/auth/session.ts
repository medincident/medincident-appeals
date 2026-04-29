import "server-only";

import type { Session } from "next-auth";

import { auth } from "./auth";
import { AuthError, AuthErrorCode, SessionErrorCode } from "./errors";

export type AuthenticatedSession = Session & {
  userId: string;
  accessToken: string;
};

export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await auth();

  if (session?.error === SessionErrorCode.RefreshAccessTokenError) {
    throw new AuthError(AuthErrorCode.RefreshFailed);
  }
  if (!session?.userId || !session.accessToken) {
    throw new AuthError(AuthErrorCode.NotAuthenticated);
  }

  return session as AuthenticatedSession;
}
