import type { JournalEntry, TradeOutcome, TradeSide } from "@chartmate/shared";
import { useEffect, useState } from "react";

import {
  createJournalEntry,
  fetchBehaviorFlags,
  fetchJournalEntries,
  fetchNewsForTicker,
  fetchQuote,
  searchInstruments,
  UnauthorizedError,
  type BehaviorFlagRecord,
  type InstrumentRecord,
  type NewsArticleRecord,
  type QuoteRecord,
} from "./api";
import { clearToken, getToken, login, register } from "./auth";

const ASSET_CLASS_LABELS: Record<InstrumentRecord["assetClass"], string> = {
  EQUITY: "Акции",
  FOREX: "Форекс",
  CRYPTO: "Крипто",
  BOND: "Облигации",
};

type JournalRow = Awaited<ReturnType<typeof fetchJournalEntries>>[number];

const BEHAVIOR_FLAG_LABELS: Record<BehaviorFlagRecord["kind"], string> = {
  OVERTRADING: "Овертрейдинг — слишком много сделок за короткий срок",
  REVENGE: "Revenge-трейдинг — новый вход сразу после убытка",
  NO_STOP: "Сделка без стопа",
  COUNTER_TREND: "Вход против тренда",
  SIZE_CREEP: "Рост размера позиции",
};

function LoginForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === "register") {
        await register(email, password);
      }
      await login(email, password);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>{mode === "login" ? "Вход" : "Регистрация"}</h2>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Пароль
        <input type="password" value={password} minLength={8} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <button type="submit" disabled={isSubmitting}>
        {mode === "login" ? "Войти" : "Зарегистрироваться"}
      </button>
      <button type="button" className="link-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

const EMPTY_FORM = {
  ticker: "",
  side: "" as TradeSide | "",
  entry: "",
  stop: "",
  target: "",
  rr: "",
  notes: "",
  plannedBeforeEntry: false,
  outcome: "" as TradeOutcome | "",
};

function NewEntryForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const entry: JournalEntry = {
      ticker: form.ticker.trim().toUpperCase(),
      plannedBeforeEntry: form.plannedBeforeEntry,
      ...(form.side && { side: form.side }),
      ...(form.entry && { entry: Number(form.entry) }),
      ...(form.stop && { stop: Number(form.stop) }),
      ...(form.target && { target: Number(form.target) }),
      ...(form.rr && { rr: Number(form.rr) }),
      ...(form.notes.trim() && { notes: form.notes.trim() }),
      ...(form.outcome && { outcome: form.outcome }),
    };

    setIsSubmitting(true);
    try {
      await createJournalEntry(entry);
      setForm(EMPTY_FORM);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="entry-form">
      <h2>Новая запись</h2>
      <div className="entry-form-grid">
        <label>
          Тикер
          <input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} required />
        </label>
        <label>
          Сторона
          <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as TradeSide | "" })}>
            <option value="">—</option>
            <option value="LONG">LONG</option>
            <option value="SHORT">SHORT</option>
          </select>
        </label>
        <label>
          Вход
          <input type="number" step="any" value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} />
        </label>
        <label>
          Стоп
          <input type="number" step="any" value={form.stop} onChange={(e) => setForm({ ...form, stop: e.target.value })} />
        </label>
        <label>
          Цель
          <input type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
        </label>
        <label>
          R:R
          <input type="number" step="any" value={form.rr} onChange={(e) => setForm({ ...form, rr: e.target.value })} />
        </label>
        <label>
          Результат
          <select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value as TradeOutcome | "" })}>
            <option value="">Открыта</option>
            <option value="WIN">WIN</option>
            <option value="LOSS">LOSS</option>
            <option value="BREAKEVEN">BREAKEVEN</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.plannedBeforeEntry}
            onChange={(e) => setForm({ ...form, plannedBeforeEntry: e.target.checked })}
          />
          План был готов заранее
        </label>
      </div>
      <label>
        Заметки
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
      </label>
      <button type="submit" disabled={isSubmitting || !form.ticker.trim()}>
        Записать сделку
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function BehaviorFlagsPanel({ flags }: { flags: BehaviorFlagRecord[] }) {
  if (flags.length === 0) {
    return null;
  }

  return (
    <section className="behavior-flags-panel">
      <h2>Поведенческие флаги</h2>
      <ul>
        {flags.map((flag) => (
          <li key={flag.id}>
            <strong>{BEHAVIOR_FLAG_LABELS[flag.kind]}</strong>
            <span className="flag-timestamp"> — {new Date(flag.detectedAt).toLocaleString("ru-RU")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarketsPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstrumentRecord[]>([]);
  const [selected, setSelected] = useState<InstrumentRecord | null>(null);
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [news, setNews] = useState<NewsArticleRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      searchInstruments(query)
        .then(setResults)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const selectInstrument = (instrument: InstrumentRecord) => {
    setSelected(instrument);
    setError(null);
    Promise.all([fetchQuote(instrument.symbol), fetchNewsForTicker(instrument.symbol)])
      .then(([nextQuote, nextNews]) => {
        setQuote(nextQuote);
        setNews(nextNews);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  return (
    <section className="markets-panel">
      <h2>Рынки</h2>
      <input
        className="markets-search"
        placeholder="Поиск: AAPL, EUR/USD, DGS10, BTCUSDT…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="error">{error}</p>}

      <ul className="instrument-results">
        {results.map((instrument) => (
          <li key={instrument.id}>
            <button type="button" className="link-button" onClick={() => selectInstrument(instrument)}>
              <strong>{instrument.symbol}</strong> — {instrument.name}{" "}
              <span className="asset-class-tag">{ASSET_CLASS_LABELS[instrument.assetClass]}</span>
            </button>
          </li>
        ))}
      </ul>

      {selected && quote && (
        <div className="quote-card">
          <h3>{selected.symbol}</h3>
          <p className="quote-price">
            {quote.price}
            {quote.changePercent !== null && (
              <span className={quote.changePercent >= 0 ? "quote-change-up" : "quote-change-down"}>
                {" "}
                {quote.changePercent >= 0 ? "+" : ""}
                {quote.changePercent.toFixed(2)}%
              </span>
            )}
          </p>
          <p className="quote-timestamp">на {new Date(quote.asOf).toLocaleString("ru-RU")}</p>

          {news.length > 0 && (
            <div className="news-list">
              <h4>Новости по инструменту</h4>
              <ul>
                {news.map((article) => (
                  <li key={article.id}>
                    <a href={article.url} target="_blank" rel="noreferrer">
                      {article.title}
                    </a>
                    <span className="flag-timestamp">
                      {" "}
                      — {article.source}, {new Date(article.publishedAt).toLocaleString("ru-RU")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [entries, setEntries] = useState<JournalRow[]>([]);
  const [flags, setFlags] = useState<BehaviorFlagRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    Promise.all([fetchJournalEntries(), fetchBehaviorFlags()])
      .then(([nextEntries, nextFlags]) => {
        setEntries(nextEntries);
        setFlags(nextFlags);
      })
      .catch((err: unknown) => {
        if (err instanceof UnauthorizedError) {
          clearToken();
          setIsAuthenticated(false);
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    reload();
  }, [isAuthenticated]);

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
    setEntries([]);
    setFlags([]);
  };

  return (
    <main>
      <header>
        <h1>ChartMate — журнал сделок</h1>
        <p className="disclaimer">
          Инструмент образовательный и не является инвестиционной рекомендацией. ChartMate не даёт торговых
          сигналов — только наблюдения, вопросы по риск-менеджменту и статистику по вашим собственным сделкам.
        </p>
      </header>

      {!isAuthenticated && <LoginForm onAuthenticated={() => setIsAuthenticated(true)} />}

      {isAuthenticated && (
        <>
          <button onClick={handleLogout}>Выйти</button>
          {error && <p className="error">{error}</p>}

          <BehaviorFlagsPanel flags={flags} />

          <MarketsPanel />

          <NewEntryForm onCreated={reload} />

          <table>
            <thead>
              <tr>
                <th>Тикер</th>
                <th>Сторона</th>
                <th>Вход</th>
                <th>Стоп</th>
                <th>R:R</th>
                <th>Спланировано заранее</th>
                <th>Результат</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.ticker}</td>
                  <td>{entry.side ?? "—"}</td>
                  <td>{entry.entry ?? "—"}</td>
                  <td>{entry.stop ?? "—"}</td>
                  <td>{entry.rr ?? "—"}</td>
                  <td>{entry.plannedBeforeEntry ? "да" : "нет"}</td>
                  <td>{entry.outcome ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
