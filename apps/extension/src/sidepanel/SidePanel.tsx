import { ANALYSIS_UPDATE_STATUS, type AnalysisUpdateEvent } from "@chartmate/shared";
import { useEffect, useRef, useState } from "react";

import type { BackgroundResponse, ExtensionMessage, SessionStatus } from "../lib/messages";
import { getOnboardingSeen, getStoredAuth, setOnboardingSeen } from "../lib/storage";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const STATUS_POLL_MS = 2000;

function sendMessage(message: ExtensionMessage): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

function renderUpdate(update: AnalysisUpdateEvent) {
  switch (update.status) {
    case ANALYSIS_UPDATE_STATUS.LOW_CONFIDENCE:
      return <p>Не могу уверенно разобрать график — попробуйте кадр покрупнее.</p>;
    case ANALYSIS_UPDATE_STATUS.MISSING_CONTEXT:
      return <p>Не удалось определить тикер или таймфрейм на графике.</p>;
    case ANALYSIS_UPDATE_STATUS.BLOCKED:
      return <p>Ответ не прошёл проверку и не показан.</p>;
    case ANALYSIS_UPDATE_STATUS.ERROR:
      return <p className="error">Не удалось выполнить анализ. Попробуйте ещё раз позже.</p>;
    case ANALYSIS_UPDATE_STATUS.COMPLETED:
      if (!update.observation) {
        return null;
      }
      return (
        <div className="observation">
          <p>{update.observation.summary}</p>
          {update.observation.questions.length > 0 && (
            <ul>
              {update.observation.questions.map((question, index) => (
                <li key={index}>{question}</li>
              ))}
            </ul>
          )}
          {update.observation.behaviorFlags.length > 0 && (
            <ul className="behavior-flags">
              {update.observation.behaviorFlags.map((flag, index) => (
                <li key={index}>
                  <strong>{flag.kind}:</strong> {flag.note}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    default:
      return null;
  }
}

function OnboardingNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="onboarding-notice">
      <h2>Прежде чем начать</h2>
      <ul>
        <li>
          Скриншот делается только с активной вкладки и только пока сессия явно запущена — в это время в панели
          виден индикатор записи.
        </li>
        <li>
          Кадры не сохраняются: анализируются и сразу удаляются, в базе остаётся только хэш кадра и извлечённые
          тикер, таймфрейм и уровни — без самого изображения.
        </li>
        <li>Расширению не нужен доступ ко всем сайтам — только к активной вкладке (разрешение `activeTab`).</li>
        <li>Это образовательный инструмент. ChartMate не даёт торговых сигналов и не является инвестиционной рекомендацией.</li>
      </ul>
      <button onClick={onDismiss}>Понятно, продолжить</button>
    </div>
  );
}

export function SidePanel() {
  const [onboardingSeen, setOnboardingSeenState] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestUpdate, setLatestUpdate] = useState<AnalysisUpdateEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    getOnboardingSeen().then(setOnboardingSeenState);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      sendMessage({ type: "GET_STATUS" }).then((response) => {
        if (response.ok) {
          setStatus(response.status);
        }
      });
    }, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    if (!status?.active || !status.sessionId || !status.apiBaseUrl) {
      return;
    }

    getStoredAuth().then((auth) => {
      if (!auth) {
        return;
      }
      const url = `${status.apiBaseUrl}/api/sessions/${status.sessionId}/analyses/stream?token=${encodeURIComponent(auth.token)}`;
      const source = new EventSource(url);
      source.onmessage = (event) => {
        setLatestUpdate(JSON.parse(event.data));
      };
      eventSourceRef.current = source;
    });

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [status?.active, status?.sessionId, status?.apiBaseUrl]);

  const handleLogin = async () => {
    setError(null);
    const response = await sendMessage({ type: "LOGIN", email, password, apiBaseUrl });
    if (response.ok) {
      setStatus(response.status);
    } else {
      setError(response.error);
    }
  };

  const handleLogout = async () => {
    const response = await sendMessage({ type: "LOGOUT" });
    if (response.ok) {
      setStatus(response.status);
      setLatestUpdate(null);
    }
  };

  const handleStart = async () => {
    setError(null);
    const response = await sendMessage({ type: "SESSION_START" });
    if (response.ok) {
      setStatus(response.status);
    } else {
      setError(response.error);
    }
  };

  const handleStop = async () => {
    const response = await sendMessage({ type: "SESSION_STOP" });
    if (response.ok) {
      setStatus(response.status);
      setLatestUpdate(null);
    }
  };

  const handleCaptureNow = async () => {
    const response = await sendMessage({ type: "CAPTURE_NOW" });
    if (response.ok) {
      setStatus(response.status);
    } else {
      setError(response.error);
    }
  };

  const handleDismissOnboarding = () => {
    void setOnboardingSeen();
    setOnboardingSeenState(true);
  };

  const isAuthenticated = status?.authenticated ?? false;
  const isActive = status?.active ?? false;

  if (onboardingSeen === null) {
    return null;
  }

  if (onboardingSeen === false) {
    return (
      <main>
        <h1>ChartMate</h1>
        <OnboardingNotice onDismiss={handleDismissOnboarding} />
      </main>
    );
  }

  return (
    <main>
      <h1>ChartMate</h1>
      <p className="disclaimer">
        Образовательный инструмент. Не даёт торговых сигналов и не является инвестиционной рекомендацией.
      </p>

      {!isAuthenticated && (
        <>
          <label>
            Адрес API
            <input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Пароль
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button onClick={handleLogin} disabled={!email || !password}>
            Войти
          </button>
        </>
      )}

      {isAuthenticated && !isActive && (
        <>
          <button onClick={handleStart}>Начать сессию</button>
          <button onClick={handleLogout}>Выйти из аккаунта</button>
        </>
      )}

      {isActive && (
        <>
          <div className="recording-indicator" role="status">
            ● Идёт запись сессии
          </div>
          <button onClick={handleCaptureNow}>Проанализировать сейчас</button>
          <button onClick={handleStop}>Завершить сессию</button>
          {latestUpdate && renderUpdate(latestUpdate)}
        </>
      )}

      {status?.lastAnalyzedAt && (
        <p>Последний анализ: {new Date(status.lastAnalyzedAt).toLocaleTimeString("ru-RU")}</p>
      )}

      {(error ?? status?.error) && <p className="error">{error ?? status?.error}</p>}
    </main>
  );
}
