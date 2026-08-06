export type ExtensionMessage =
  | { type: "LOGIN"; email: string; password: string; apiBaseUrl: string }
  | { type: "LOGOUT" }
  | { type: "SESSION_START" }
  | { type: "SESSION_STOP" }
  | { type: "CAPTURE_NOW" }
  | { type: "GET_STATUS" };

export interface SessionStatus {
  authenticated: boolean;
  apiBaseUrl: string | null;
  active: boolean;
  sessionId: string | null;
  lastAnalyzedAt: number | null;
  error: string | null;
}

export type BackgroundResponse = { ok: true; status: SessionStatus } | { ok: false; error: string };
