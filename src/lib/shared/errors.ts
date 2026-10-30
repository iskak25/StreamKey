export type ErrorCode =
  | "VALIDATION_ERROR" | "AUTH_REQUIRED" | "SESSION_INVALID" | "FORBIDDEN" | "OWNER_BLOCKED"
  | "NOT_FOUND" | "LINK_ALREADY_USED" | "VERSION_CONFLICT" | "IDEMPOTENCY_CONFLICT"
  | "ACCESS_EXPIRED" | "ACCESS_REVOKED" | "RATE_LIMITED" | "TEMPORARY_UNAVAILABLE"
  | "LINK_UNAVAILABLE" | "QUOTA_EXCEEDED" | "ACCESS_NOT_STARTED";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400, AUTH_REQUIRED: 401, SESSION_INVALID: 401, FORBIDDEN: 403, OWNER_BLOCKED: 403,
  NOT_FOUND: 404, LINK_ALREADY_USED: 409, VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409,
  ACCESS_EXPIRED: 410, ACCESS_REVOKED: 410, RATE_LIMITED: 429, TEMPORARY_UNAVAILABLE: 503,
  LINK_UNAVAILABLE: 404, QUOTA_EXCEEDED: 403, ACCESS_NOT_STARTED: 403,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string, readonly headers: Record<string, string> = {}) {
    super(message);
    this.status = STATUS[code];
  }
}

export function errorBody(err: ApiError, requestId: string) {
  return { error: { code: err.code, message: err.message, requestId } };
}
