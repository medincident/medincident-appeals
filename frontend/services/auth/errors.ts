export const SessionErrorCode = {
  RefreshAccessTokenError: "RefreshAccessTokenError",
} as const;

export type SessionErrorCode =
  (typeof SessionErrorCode)[keyof typeof SessionErrorCode];

export const AuthErrorCode = {
  NotAuthenticated: "NOT_AUTHENTICATED",
  RefreshFailed: "AUTH_REFRESH_FAILED",
} as const;

export type AuthErrorCode =
  (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode) {
    super(code);
    this.code = code;
    this.name = "AuthError";
  }
}

export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError;
}
