import { useEffect, useState } from "react";

import {
  analyzeInstrument,
  askFollowUp,
  deleteJournalEntry,
  fetchJournalEntries,
  fetchLatestNews,
  fetchNewsForTicker,
  fetchQuote,
  searchInstruments,
  TIMEFRAME_OPTIONS,
  UnauthorizedError,
  type InstrumentRecord,
  type NewsArticleRecord,
  type ObservationRecord,
  type QuoteRecord,
} from "./api";
import { clearToken, getToken, login, register } from "./auth";
import { InstrumentIcon } from "./instrumentIcons";
import { useLiveQuotes, formatPrice, type LiveQuoteState } from "./useLiveQuotes";
import { MarketOverview } from "./MarketOverview";
import { PriceChart } from "./PriceChart";

const ASSET_CLASS_ORDER: InstrumentRecord["assetClass"][] = ["CRYPTO", "EQUITY", "FOREX", "BOND"];

const ASSET_CLASS_LABELS: Record<InstrumentRecord["assetClass"], string> = {
  EQUITY: "Акции",
  FOREX: "Форекс",
  CRYPTO: "Крипто",
  BOND: "Облигации",
};

type JournalRow = Awaited<ReturnType<typeof fetchJournalEntries>>[number];

/** Компактный выбор инструмента: категории свёрнуты, список открывается по клику на одну из них. */
/** Состояние потока котировок: замершие цифры не должны выдаваться за живые. */
function FeedStatus({ state }: { state: "connecting" | "live" | "retrying" }) {
  const label = state === "live" ? "цены в реальном времени" : state === "connecting" ? "подключаемся…" : "связь потеряна, восстанавливаем";
  return (
    <span className={`feed-status feed-${state}`} title={label}>
      <span className="feed-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Живая цена рядом с инструментом: подсвечивается на тик вверх или вниз. */
function LivePriceTag({ quote }: { quote: LiveQuoteState | undefined }) {
  if (!quote) return null;
  const flash = quote.dir ? ` flash-${quote.dir}` : "";
  return (
    <span className={`live-price${flash}`}>
      {formatPrice(quote.price)}
      {quote.changePercent !== null && (
        <span className={quote.changePercent >= 0 ? "live-change-up" : "live-change-down"}>
          {quote.changePercent >= 0 ? "+" : ""}
          {quote.changePercent.toFixed(2)}%
        </span>
      )}
    </span>
  );
}

function InstrumentPicker({
  instruments,
  selectedSymbol,
  onSelect,
  openCategory,
  onToggleCategory,
  quotes,
}: {
  instruments: InstrumentRecord[];
  selectedSymbol: string | null;
  onSelect: (instrument: InstrumentRecord) => void;
  /** Поднимается наверх только там, где по открытой категории решают, на что подписываться. */
  openCategory?: InstrumentRecord["assetClass"] | null;
  onToggleCategory?: (assetClass: InstrumentRecord["assetClass"]) => void;
  quotes?: Map<string, LiveQuoteState>;
}) {
  const [ownCategory, setOwnCategory] = useState<InstrumentRecord["assetClass"] | null>(null);
  const activeCategory = openCategory !== undefined ? openCategory : ownCategory;
  const toggleCategory = (assetClass: InstrumentRecord["assetClass"]) => {
    if (onToggleCategory) onToggleCategory(assetClass);
    else setOwnCategory(ownCategory === assetClass ? null : assetClass);
  };

  const categories = ASSET_CLASS_ORDER.map((assetClass) => ({
    assetClass,
    instruments: instruments.filter((instrument) => instrument.assetClass === assetClass),
  })).filter((category) => category.instruments.length > 0);

  const openInstruments = categories.find((category) => category.assetClass === activeCategory)?.instruments ?? [];

  return (
    <div className="instrument-picker">
      <div className="instrument-picker-tabs">
        {categories.map((category) => (
          <button
            key={category.assetClass}
            type="button"
            className={`instrument-picker-tab category-${category.assetClass}${activeCategory === category.assetClass ? " open" : ""}`}
            onClick={() => toggleCategory(category.assetClass)}
          >
            {ASSET_CLASS_LABELS[category.assetClass]}
            <span className="instrument-category-count">{category.instruments.length}</span>
          </button>
        ))}
      </div>

      {activeCategory && (
        <ul className={`instrument-results category-${activeCategory}`}>
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
                <LivePriceTag quote={quotes?.get(instrument.symbol)} />
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

function ObservationsPanel({
  selected,
  timeframe,
}: {
  selected: InstrumentRecord | null;
  timeframe: string;
}) {
  const [result, setResult] = useState<ObservationRecord | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <button type="button" onClick={handleAnalyze} disabled={!selected || isAnalyzing}>
          {isAnalyzing && <span className="spinner" aria-hidden="true" />}
          {isAnalyzing
            ? "Анализирую…"
            : selected
              ? `Проанализировать ${selected.symbol} · ${timeframe}`
              : "Выберите инструмент в ленте"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="empty-state">{notice}</p>}

      {!result && !error && !notice && (
        <p className="empty-state">Выберите инструмент в ленте слева и нажмите «Проанализировать», чтобы получить наблюдение.</p>
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

/** Лента котировок: единственное место, где выбирают класс активов и инструмент. */
function MarketTape({
  instruments,
  quotes,
  selected,
  onSelect,
  openCategory,
  onToggleCategory,
}: {
  instruments: InstrumentRecord[];
  quotes: Map<string, LiveQuoteState>;
  selected: InstrumentRecord | null;
  onSelect: (instrument: InstrumentRecord) => void;
  openCategory: InstrumentRecord["assetClass"] | null;
  onToggleCategory: (assetClass: InstrumentRecord["assetClass"]) => void;
}) {
  const [query, setQuery] = useState("");

  // Каталог в 88 позиций приходит один раз, поэтому поиск фильтрует его на месте
  const needle = query.trim().toUpperCase();
  const filtered = needle
    ? instruments.filter(
        (i) => i.symbol.toUpperCase().includes(needle) || i.name.toUpperCase().includes(needle),
      )
    : instruments;

  return (
    <section className="panel markets-panel">
      <div className="panel-head">
        <h2>Лента</h2>
        <span className="panel-hint">{instruments.length} инструментов</span>
      </div>

      <div className="tape-body">
        <input
          className="markets-search"
          placeholder="Поиск: AAPL, EUR/USD, DGS10, BTCUSDT…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <InstrumentPicker
          instruments={filtered}
          selectedSymbol={selected?.symbol ?? null}
          onSelect={onSelect}
          openCategory={openCategory}
          onToggleCategory={onToggleCategory}
          quotes={quotes}
        />

        {openCategory && openCategory !== "CRYPTO" && (
          <p className="live-source-note">
            Цены этого класса активов идут опросом провайдера раз в 15 секунд: бесплатный тариф Twelve Data
            допускает 8 запросов в минуту, чаще нельзя. Поток раз в секунду есть только у крипты — его отдаёт
            WebSocket Binance.
          </p>
        )}
      </div>
    </section>
  );
}

/** Выбранный инструмент: цена из потока, свечи и новости по тикеру. */
function InstrumentPanel({
  selected,
  live,
  timeframe,
  onTimeframe,
}: {
  selected: InstrumentRecord;
  live: LiveQuoteState | undefined;
  timeframe: string;
  onTimeframe: (tf: string) => void;
}) {
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [news, setNews] = useState<NewsArticleRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchQuote(selected.symbol), fetchNewsForTicker(selected.symbol)])
      .then(([nextQuote, nextNews]) => {
        if (cancelled) return;
        setQuote(nextQuote);
        setNews(nextNews);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selected.symbol]);

  const price = live?.price ?? quote?.price ?? null;
  const change = live?.changePercent ?? quote?.changePercent ?? null;

  return (
    <section className="panel instrument-panel">
      <div className="instrument-head">
        <div className="instrument-id">
          <span className="instrument-symbol">
            <InstrumentIcon instrument={selected} />
            {selected.symbol}
          </span>
          <span className="instrument-meta">
            {selected.name}
            {selected.exchange ? ` · ${selected.exchange}` : ""} · {timeframe}
          </span>
        </div>

        <div className="instrument-price">
          <span className={`quote-price${live?.dir ? ` flash-${live.dir}` : ""}`}>
            {price === null ? "—" : formatPrice(price)}
          </span>
          <span className="quote-timestamp">
            {change !== null && (
              <span className={change >= 0 ? "quote-change-up" : "quote-change-down"}>
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%{" · "}
              </span>
            )}
            {live ? (
              <>
                <span className="live-dot" aria-hidden="true" />
                {live.source === "BINANCE_WS" ? "обновление раз в секунду" : "обновление раз в 15 секунд"}
                {" · "}
                {new Date(live.asOf).toLocaleTimeString("ru-RU")}
              </>
            ) : quote ? (
              <>на {new Date(quote.asOf).toLocaleString("ru-RU")}</>
            ) : (
              "ждём цену…"
            )}
          </span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="instrument-body">
        <div className="chart-tfs">
          {TIMEFRAME_OPTIONS.map((tf) => (
            <button
              key={tf}
              type="button"
              className="tf-btn"
              aria-pressed={timeframe === tf}
              onClick={() => onTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>

        <PriceChart symbol={selected.symbol} timeframe={timeframe} livePrice={live?.price} />

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
    </section>
  );
}

/** Лента обновляется раз в минуту: сервер забирает RSS с тем же шагом. */
const NEWS_REFRESH_MS = 60_000;

function MarketNewsPanel() {
  const [latestNews, setLatestNews] = useState<NewsArticleRecord[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () =>
      fetchLatestNews()
        .then((news) => {
          if (cancelled) return;
          setLatestNews(news);
          setUpdatedAt(new Date());
        })
        .catch(() => {
          // лента новостей не критична для экрана
        });

    load();
    const handle = setInterval(load, NEWS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  if (!latestNews.length) return null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Новости рынка</h2>
        <span className="panel-hint">
          обновление раз в минуту
          {updatedAt && ` · ${updatedAt.toLocaleTimeString("ru-RU")}`}
        </span>
      </div>
      <div className="news-list latest-news">
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
    </section>
  );
}

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [entries, setEntries] = useState<JournalRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Каталог, выбранный класс и инструмент живут здесь: так выбор один на весь экран,
  // а подписка на котировки открывается ровно одна.
  const [instruments, setInstruments] = useState<InstrumentRecord[]>([]);
  const [openCategory, setOpenCategory] = useState<InstrumentRecord["assetClass"] | null>("CRYPTO");
  const [selected, setSelected] = useState<InstrumentRecord | null>(null);
  const [timeframe, setTimeframe] = useState("1h");

  // Крипту держим в подписке всегда: обзор рынка показывает её независимо от
  // того, какая категория открыта в ленте. Один сокет Binance на всех.
  const visibleSymbols = [
    ...instruments.filter((i) => i.assetClass === "CRYPTO").map((i) => i.symbol),
    ...instruments
      .filter((i) => i.assetClass === openCategory && i.assetClass !== "CRYPTO")
      .slice(0, 15)
      .map((i) => i.symbol),
    ...(selected ? [selected.symbol] : []),
  ];
  const { quotes: liveQuotes, state: feedState } = useLiveQuotes(isAuthenticated ? visibleSymbols : []);

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
    searchInstruments("")
      .then(setInstruments)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [isAuthenticated]);

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
    setEntries([]);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить эту запись?")) return;
    try {
      await deleteJournalEntry(id);
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
    <main className="app">
      <header className="topbar">
        <div className="brand">
          Chart<span>Mate</span>
        </div>
        <p className="rule-chip">
          Наблюдения и дисциплина. Без сигналов, прогнозов и целевых цен — инструмент образовательный и не
          является инвестиционной рекомендацией.
        </p>
        {isAuthenticated && <FeedStatus state={feedState} />}
        {isAuthenticated && (
          <div className="topbar-right">
            <button type="button" className="link-button" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        )}
      </header>

      {!isAuthenticated && <LoginForm onAuthenticated={() => setIsAuthenticated(true)} />}

      {isAuthenticated && (
        <>
          {error && <p className="error">{error}</p>}

          <div className="shell">
            <aside className="zone zone-tape">
              <MarketTape
                instruments={instruments}
                quotes={liveQuotes}
                selected={selected}
                onSelect={setSelected}
                openCategory={openCategory}
                onToggleCategory={(assetClass) =>
                  setOpenCategory(openCategory === assetClass ? null : assetClass)
                }
              />
            </aside>

            <section className="zone zone-center">
              <MarketOverview
                quotes={liveQuotes}
                instruments={instruments}
                selectedSymbol={selected?.symbol ?? null}
                onSelect={setSelected}
              />
              <ObservationsPanel selected={selected} timeframe={timeframe} />
              {selected && (
                <InstrumentPanel
                  selected={selected}
                  live={liveQuotes.get(selected.symbol)}
                  timeframe={timeframe}
                  onTimeframe={setTimeframe}
                />
              )}
              <MarketNewsPanel />
            </section>

          </div>

          <div className="trades-wrap">
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
                      <button type="button" className="link-button link-button-danger" onClick={() => handleDelete(entry.id)}>
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </main>
  );
}
