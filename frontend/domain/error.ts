export type ResultErrorType =
  | "ERROR"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "VALIDATION_ERROR"
  | "ZITADEL_ERROR"
  | "AUTH_ERROR";

export type ResultError = {
  type: ResultErrorType;
  message: string;
  code?: string | number;
  details?: any;
};

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: ResultError };
