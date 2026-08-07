import type { JournalEntry, TradeOutcome, TradeSide } from "@chartmate/shared";
import { useEffect, useState } from "react";

import {
  analyzeInstrument,
  askFollowUp,
  createJournalEntry,
  deleteJournalEntry,
  fetchJournalEntries,
  fetchLatestNews,
  fetchNewsForTicker,
  fetchQuote,
  searchInstruments,
  TIMEFRAME_OPTIONS,
  updateJournalEntry,
  UnauthorizedError,
  type InstrumentRecord,
  type NewsArticleRecord,
  type ObservationRecord,
  type QuoteRecord,
} from "./api";
import { clearToken, getToken, login, register } from "./auth";
import { InstrumentIcon } from "./instrumentIcons";

const ASSET_CLASS_ORDER: InstrumentRecord["assetClass"][] = ["CRYPTO", "EQUITY", "FOREX", "BOND"];

const ASSET_CLASS_LABELS: Record<InstrumentRecord["assetClass"], string> = {
  EQUITY: "Акции",
  FOREX: "Форекс",
  CRYPTO: "Крипто",
  BOND: "Облигации",
};

type JournalRow = Awaited<ReturnType<typeof fetchJournalEntries>>[number];

/** Компактный выбор инструмента: категории свёрнуты, список открывается по клику на одну из них. */
function InstrumentPicker({
  instruments,
  selectedSymbol,
  onSelect,
}: {
  instruments: InstrumentRecord[];
  selectedSymbol: string | null;
  onSelect: (instrument: InstrumentRecord) => void;
}) {
  const [openCategory, setOpenCategory] = useState<InstrumentRecord["assetClass"] | null>(null);

  const categories = ASSET_CLASS_ORDER.map((assetClass) => ({
    assetClass,
    instruments: instruments.filter((instrument) => instrument.assetClass === assetClass),
  })).filter((category) => category.instruments.length > 0);

  const openInstruments = categories.find((category) => category.assetClass === openCategory)?.instruments ?? [];

  return (
    <div className="instrument-picker">
      <div className="instrument-picker-tabs">
        {categories.map((category) => (
          <button
            key={category.assetClass}
            type="button"
            className={`instrument-picker-tab category-${category.assetClass}${openCategory === category.assetClass ? " open" : ""}`}
            onClick={() => setOpenCategory(openCategory === category.assetClass ? null : category.assetClass)}
          >
            {ASSET_CLASS_LABELS[category.assetClass]}
            <span className="instrument-category-count">{category.instruments.length}</span>
          </button>
        ))}
      </div>

      {openCategory && (
        <ul className={`instrument-results category-${openCategory}`}>
          {openInstruments.map((instrument) => (
            <li key={instrument.id}>
              <button
                type="button"
                className={`instrument-chip${selectedSymbol === instrument.symbol ? " active" : ""}`}
                onClick={() => onSelect(instrument)}
                title={instrument.name}
              >
                <InstrumentIcon instrument={instrument} />
                <span className="instrument-chip-symbol">{instrument.symbol}</span>
                <span className="instrument-chip-name">{instrument.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

function entryToForm(row: JournalRow): typeof EMPTY_FORM {
  return {
    ticker: row.ticker,
    side: row.side ?? "",
    entry: row.entry?.toString() ?? "",
    stop: row.stop?.toString() ?? "",
    target: row.target?.toString() ?? "",
    rr: row.rr?.toString() ?? "",
    notes: row.notes ?? "",
    plannedBeforeEntry: row.plannedBeforeEntry,
    outcome: row.outcome ?? "",
  };
}

function NewEntryForm({
  editingEntry,
  onSaved,
  onCancelEdit,
}: {
  editingEntry: JournalRow | null;
  onSaved: () => void;
  onCancelEdit: () => void;
}) {
  const [form, setForm] = useState(() => (editingEntry ? entryToForm(editingEntry) : EMPTY_FORM));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [instruments, setInstruments] = useState<InstrumentRecord[]>([]);

  useEffect(() => {
    searchInstruments("")
      .then(setInstruments)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

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
      if (editingEntry) {
        await updateJournalEntry(editingEntry.id, entry);
      } else {
        await createJournalEntry(entry);
        setForm(EMPTY_FORM);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="entry-form">
      <h2>{editingEntry ? "Редактирование записи" : "Новая запись"}</h2>

      <div className="entry-form-picker">
        <InstrumentPicker
          instruments={instruments}
          selectedSymbol={form.ticker || null}
          onSelect={(instrument) => setForm({ ...form, ticker: instrument.symbol })}
        />
      </div>

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
      <div className="entry-form-actions">
        <button type="submit" disabled={isSubmitting || !form.ticker.trim()}>
          {editingEntry ? "Сохранить" : "Записать сделку"}
        </button>
        {editingEntry && (
          <button type="button" className="link-button" onClick={onCancelEdit}>
            Отменить
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/** Клик по вопросу — ИИ сам раскрывает его объективными фактами по инструменту, через тот же guardrail. */
function QuestionThread({ observationId, question }: { observationId: string; question: string }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    const wasOpen = open;
    setOpen(!wasOpen);
    if (wasOpen || reply || isLoading) return;

    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await askFollowUp(observationId, question);
      if (result.guardrailFlagged || !result.reply) {
        setNotice("Ответ модели не прошёл проверку guardrail.");
      } else {
        setReply(result.reply);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <li className="question-thread">
      <button type="button" className="question-toggle" onClick={handleToggle}>
        <span className={`question-caret${open ? " open" : ""}`} aria-hidden="true">
          ›
        </span>
        {question}
      </button>
      {open && (
        <div className="question-thread-body">
          {isLoading && (
            <p className="empty-state">
              <span className="spinner" aria-hidden="true" />
              Загружаю…
            </p>
          )}
          {reply && <p className="question-reply">{reply}</p>}
          {notice && <p className="empty-state">{notice}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </li>
  );
}

function ObservationsPanel() {
  const [result, setResult] = useState<ObservationRecord | null>(null);
  const [instruments, setInstruments] = useState<InstrumentRecord[]>([]);
  const [selected, setSelected] = useState<InstrumentRecord | null>(null);
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAME_OPTIONS)[number]>("1h");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    searchInstruments("")
      .then(setInstruments)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const handleAnalyze = async () => {
    if (!selected) return;
    setIsAnalyzing(true);
    setError(null);
    setNotice(null);
    try {
      const analyzed = await analyzeInstrument(selected.symbol, timeframe);
      if (analyzed.guardrailFlagged || !analyzed.observationJson.summary) {
        setNotice("Ответ модели не прошёл проверку guardrail и не был показан — попробуйте ещё раз.");
        setResult(null);
      } else {
        setResult({
          id: analyzed.id,
          createdAt: analyzed.createdAt,
          visionJson: analyzed.visionJson,
          observationJson: analyzed.observationJson as ObservationRecord["observationJson"],
          newsJson: [],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <section className="observations-panel">
      <div className="observations-panel-title">
        <span className="live-dot" aria-hidden="true" />
        <h2>Анализ в реальном времени</h2>
      </div>
      <p className="disclaimer">
        Только объективное описание графика и данных, вопросы по риск-менеджменту — без направленных прогнозов,
        целевых цен и вероятностей движения.
      </p>

      <div className="analyze-toolbar">
        <InstrumentPicker instruments={instruments} selectedSymbol={selected?.symbol ?? null} onSelect={setSelected} />
        <div className="analyze-controls">
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as (typeof TIMEFRAME_OPTIONS)[number])}>
            {TIMEFRAME_OPTIONS.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleAnalyze} disabled={!selected || isAnalyzing}>
            {isAnalyzing && <span className="spinner" aria-hidden="true" />}
            {isAnalyzing ? "Анализирую…" : selected ? `Проанализировать ${selected.symbol}` : "Выберите инструмент"}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="empty-state">{notice}</p>}

      {!result && !error && !notice && (
        <p className="empty-state">Выберите инструмент выше и нажмите «Проанализировать», чтобы получить наблюдение.</p>
      )}

      {result && (
        <ul className="observation-list">
          <li className="observation-card highlight">
            <div className="observation-card-header">
              <span className="observation-badge">Новое</span>
              {selected && <InstrumentIcon instrument={selected} />}
              <strong>{result.visionJson.ticker ?? "Тикер не определён"}</strong>
              {result.visionJson.timeframe && <span className="instrument-category-count"> · {result.visionJson.timeframe}</span>}
              <span className="flag-timestamp"> — {new Date(result.createdAt).toLocaleString("ru-RU")}</span>
            </div>
            <p>{result.observationJson.summary}</p>
            {result.observationJson.questions.length > 0 && (
              <ul className="observation-questions">
                {result.observationJson.questions.map((q, i) => (
                  <QuestionThread key={i} observationId={result.id} question={q} />
                ))}
              </ul>
            )}
          </li>
        </ul>
      )}
    </section>
  );
}

function MarketsPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstrumentRecord[]>([]);
  const [selected, setSelected] = useState<InstrumentRecord | null>(null);
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [news, setNews] = useState<NewsArticleRecord[]>([]);
  const [latestNews, setLatestNews] = useState<NewsArticleRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLatestNews()
      .then(setLatestNews)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

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

      <InstrumentPicker instruments={results} selectedSymbol={selected?.symbol ?? null} onSelect={selectInstrument} />

      {selected && quote && (
        <div className="quote-card">
          <h3 className="quote-card-title">
            <InstrumentIcon instrument={selected} />
            {selected.symbol}
          </h3>
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

      {latestNews.length > 0 && (
        <div className="news-list latest-news">
          <h4>Последние новости рынка</h4>
          <ul>
            {latestNews.map((article) => (
              <li key={article.id}>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
                <span className="flag-timestamp">
                  {" "}
                  — {article.source}, {new Date(article.publishedAt).toLocaleString("ru-RU")}
                  {article.tickers.length > 0 && ` · ${article.tickers.join(", ")}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [entries, setEntries] = useState<JournalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<JournalRow | null>(null);

  const reload = () => {
    fetchJournalEntries()
      .then(setEntries)
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
    setEditingEntry(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить эту запись?")) return;
    try {
      await deleteJournalEntry(id);
      if (editingEntry?.id === id) setEditingEntry(null);
      reload();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        clearToken();
        setIsAuthenticated(false);
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
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

          <ObservationsPanel />

          <MarketsPanel />

          <NewEntryForm
            key={editingEntry?.id ?? "new"}
            editingEntry={editingEntry}
            onSaved={() => {
              setEditingEntry(null);
              reload();
            }}
            onCancelEdit={() => setEditingEntry(null)}
          />

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
                <th>Действия</th>
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
                  <td>
                    <div className="table-actions">
                      <button type="button" className="link-button" onClick={() => setEditingEntry(entry)}>
                        Изменить
                      </button>
                      <button type="button" className="link-button link-button-danger" onClick={() => handleDelete(entry.id)}>
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
