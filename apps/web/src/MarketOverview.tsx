import { useEffect, useState } from "react";
import type { CoinOverview } from "@chartmate/shared";

import { fetchMarketOverview, type InstrumentRecord } from "./api";
import { formatPrice, type LiveQuoteState } from "./useLiveQuotes";

/** Капитализация и объём читаются только в сокращённой записи. */
function compact(value: number | null): string {
  if (value === null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)} трлн`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)} млрд`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)} млн`;
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="muted-cell">—</span>;
  return (
    <span className={value >= 0 ? "quote-change-up" : "quote-change-down"}>
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${((i / (points.length - 1)) * 86).toFixed(1)},${(22 - ((p - min) / span) * 19).toFixed(1)}`)
    .join(" ");

  return (
    <svg className="spark" width="86" height="24" viewBox="0 0 86 24" aria-hidden="true">
      <polyline points={d} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Обзор рынка в привычной раскладке CoinMarketCap. Капитализация, объём и
 * предложение приходят от CoinGecko раз в минуту, а цена в строке подменяется
 * живой из потока Binance, если такой тикер есть в каталоге.
 */
export function MarketOverview({
  quotes,
  instruments,
  selectedSymbol,
  onSelect,
}: {
  quotes: Map<string, LiveQuoteState>;
  instruments: InstrumentRecord[];
  selectedSymbol: string | null;
  onSelect: (instrument: InstrumentRecord) => void;
}) {
  const [coins, setCoins] = useState<CoinOverview[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () =>
      fetchMarketOverview(25)
        .then((rows) => {
          if (!cancelled) setCoins(rows);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        });

    load();
    const handle = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  if (error && !coins.length) return <p className="chart-empty">Обзор рынка недоступен: {error}</p>;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Обзор рынка</h2>
        <span className="panel-hint">CoinGecko · раз в минуту · цена живая</span>
      </div>

      <div className="overview-scroll">
        <table className="overview-table">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th>Монета</th>
              <th className="num">Цена</th>
              <th className="num">1ч</th>
              <th className="num">24ч</th>
              <th className="num">7д</th>
              <th className="num">Капитализация</th>
              <th className="num">Объём 24ч</th>
              <th className="num">В обращении</th>
              <th>7 дней</th>
            </tr>
          </thead>
          <tbody>
            {coins.map((coin) => {
              const live = coin.tradingSymbol ? quotes.get(coin.tradingSymbol) : undefined;
              const price = live?.price ?? coin.price;
              const instrument = coin.tradingSymbol
                ? instruments.find((i) => i.symbol === coin.tradingSymbol)
                : undefined;
              const isSelected = Boolean(coin.tradingSymbol && coin.tradingSymbol === selectedSymbol);

              return (
                <tr
                  key={coin.id}
                  className={`${isSelected ? "selected " : ""}${instrument ? "clickable" : ""}`}
                  onClick={instrument ? () => onSelect(instrument) : undefined}
                >
                  <td className="col-rank">{coin.rank ?? "—"}</td>
                  <td>
                    <span className="coin-cell">
                      <img className="coin-logo" src={coin.image} alt="" width="20" height="20" loading="lazy" />
                      <span className="coin-name">{coin.name}</span>
                      <span className="coin-symbol">{coin.symbol}</span>
                    </span>
                  </td>
                  <td className={`num price-cell${live?.dir ? ` flash-${live.dir}` : ""}`}>${formatPrice(price)}</td>
                  <td className="num">
                    <Change value={coin.change1h} />
                  </td>
                  <td className="num">
                    <Change value={coin.change24h} />
                  </td>
                  <td className="num">
                    <Change value={coin.change7d} />
                  </td>
                  <td className="num">${compact(coin.marketCap)}</td>
                  <td className="num">${compact(coin.volume24h)}</td>
                  <td className="num">
                    {coin.circulatingSupply === null ? "—" : `${compact(coin.circulatingSupply)} ${coin.symbol}`}
                  </td>
                  <td>
                    <Sparkline points={coin.sparkline7d} up={(coin.change7d ?? 0) >= 0} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
