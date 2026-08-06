import { AUTO_ANALYSIS_DEBOUNCE_MS, PHASH_DIFF_THRESHOLD } from "@chartmate/shared";

import { downscaleToJpeg } from "../lib/downscale";
import type { BackgroundResponse, ExtensionMessage, SessionStatus } from "../lib/messages";
import { computePHash, phashDiffRatio } from "../lib/phash";
import { clearStoredAuth, getStoredAuth, setStoredAuth } from "../lib/storage";

interface SessionState {
  token: string | null;
  apiBaseUrl: string | null;
  active: boolean;
  sessionId: string | null;
  lastPHash: string | null;
  lastAnalyzedAt: number | null;
  intervalId: ReturnType<typeof setInterval> | null;
  error: string | null;
}

const state: SessionState = {
  token: null,
  apiBaseUrl: null,
  active: false,
  sessionId: null,
  lastPHash: null,
  lastAnalyzedAt: null,
  intervalId: null,
  error: null,
};

void getStoredAuth().then((auth) => {
  if (auth) {
    state.token = auth.token;
    state.apiBaseUrl = auth.apiBaseUrl;
  }
});

function getStatus(): SessionStatus {
  return {
    authenticated: Boolean(state.token && state.apiBaseUrl),
    apiBaseUrl: state.apiBaseUrl,
    active: state.active,
    sessionId: state.sessionId,
    lastAnalyzedAt: state.lastAnalyzedAt,
    error: state.error,
  };
}

function authHeaders(): Record<string, string> {
  return state.token ? { authorization: `Bearer ${state.token}` } : {};
}

async function login(email: string, password: string, apiBaseUrl: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Не удалось войти: ${response.status}`);
  }
  const { accessToken } = (await response.json()) as { accessToken: string };

  state.token = accessToken;
  state.apiBaseUrl = apiBaseUrl;
  await setStoredAuth({ token: accessToken, apiBaseUrl });
}

async function logout(): Promise<void> {
  await stopSession();
  state.token = null;
  state.apiBaseUrl = null;
  await clearStoredAuth();
}

async function captureActiveTab(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.windowId) {
    throw new Error("Активная вкладка не найдена");
  }
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 });
}

async function submitFrame(dataUrl: string): Promise<void> {
  if (!state.sessionId || !state.apiBaseUrl) {
    return;
  }

  const phash = await computePHash(dataUrl);
  const { base64, mediaType } = await downscaleToJpeg(dataUrl);

  const response = await fetch(`${state.apiBaseUrl}/api/sessions/${state.sessionId}/frames`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ phash, imageBase64: base64, mediaType }),
  });

  if (!response.ok) {
    state.error = `Ошибка отправки кадра: ${response.status}`;
    return;
  }

  state.lastPHash = phash;
  state.lastAnalyzedAt = Date.now();
  state.error = null;
}

async function maybeCaptureAndAnalyze(force: boolean): Promise<void> {
  try {
    const dataUrl = await captureActiveTab();
    const phash = await computePHash(dataUrl);

    const diff = state.lastPHash ? phashDiffRatio(phash, state.lastPHash) : 1;
    if (!force && diff <= PHASH_DIFF_THRESHOLD) {
      return;
    }

    await submitFrame(dataUrl);
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  }
}

async function startSession(): Promise<void> {
  if (!state.token || !state.apiBaseUrl) {
    throw new Error("Сначала войдите в аккаунт");
  }

  const response = await fetch(`${state.apiBaseUrl}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
  });
  if (!response.ok) {
    throw new Error(`Не удалось создать сессию: ${response.status}`);
  }
  const session = (await response.json()) as { id: string };

  state.active = true;
  state.sessionId = session.id;
  state.lastPHash = null;
  state.error = null;

  state.intervalId = setInterval(() => {
    void maybeCaptureAndAnalyze(false);
  }, AUTO_ANALYSIS_DEBOUNCE_MS);
}

async function stopSession(): Promise<void> {
  if (state.intervalId) {
    clearInterval(state.intervalId);
  }
  if (state.sessionId && state.apiBaseUrl) {
    await fetch(`${state.apiBaseUrl}/api/sessions/${state.sessionId}/end`, {
      method: "PATCH",
      headers: authHeaders(),
    }).catch(() => undefined);
  }

  state.active = false;
  state.sessionId = null;
  state.intervalId = null;
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (response: BackgroundResponse) => void) => {
    (async () => {
      try {
        switch (message.type) {
          case "LOGIN":
            await login(message.email, message.password, message.apiBaseUrl);
            break;
          case "LOGOUT":
            await logout();
            break;
          case "SESSION_START":
            await startSession();
            break;
          case "SESSION_STOP":
            await stopSession();
            break;
          case "CAPTURE_NOW":
            await maybeCaptureAndAnalyze(true);
            break;
          case "GET_STATUS":
            break;
        }
        sendResponse({ ok: true, status: getStatus() });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();

    return true;
  },
);
