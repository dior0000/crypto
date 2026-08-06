export const APP_ERROR_CODE = {
  FRAME_CONFIDENCE_TOO_LOW: "FRAME_CONFIDENCE_TOO_LOW",
  FREE_TIER_LIMIT_REACHED: "FREE_TIER_LIMIT_REACHED",
  GUARDRAIL_BLOCKED: "GUARDRAIL_BLOCKED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_NOT_ACTIVE: "SESSION_NOT_ACTIVE",
  MARKET_DATA_UNAVAILABLE: "MARKET_DATA_UNAVAILABLE",
  EMAIL_ALREADY_REGISTERED: "EMAIL_ALREADY_REGISTERED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
} as const;

export type AppErrorCode = (typeof APP_ERROR_CODE)[keyof typeof APP_ERROR_CODE];

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}
