import { useEffect, useState } from "react";

import { fetchOhlcv, type OhlcvResponse } from "./api";

const W = 760;
const H = 240;
const PAD_L = 8;
const PAD_R = 66;
const PAD_T = 12;
const PAD_B = 20;
/** Сколько последних свечей показываем: больше — и тело свечи становится тоньше линии. */
const VISIBLE = 60;

interface Props {
  symbol: string;
  timeframe: string;
  /** Текущая цена из потока: рисуем её отдельной линией поверх свечей. */
  livePrice?: number;
}

export function PriceChart({ symbol, timeframe, livePrice }: Props) {
  // Результат храним вместе с ключом запроса: так смена инструмента сама
  // «гасит» прошлые свечи, без синхронного сброса состояния в эффекте.
  const requestKey = `${symbol}|${timeframe}`;
  const [loaded, setLoaded] = useState<{ key: string; data: OhlcvResponse } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchOhlcv(symbol, timeframe)
      .then((next) => {
        if (!cancelled) setLoaded({ key: requestKey, data: next });
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailed({ key: requestKey, message: err instanceof Error ? err.message : String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [requestKey, symbol, timeframe]);

  const data = loaded?.key === requestKey ? loaded.data : null;
  const error = failed?.key === requestKey ? failed.message : null;

  if (error) return <p className="chart-empty">График недоступен: {error}</p>;
  if (!data) return <p className="chart-empty">Загружаем свечи…</p>;

  const candles = data.candles.slice(-VISIBLE);
  if (!candles.length) return <p className="chart-empty">По этому инструменту свечей нет.</p>;

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  let lo = Math.min(...lows, livePrice ?? Infinity);
  let hi = Math.max(...highs, livePrice ?? -Infinity);
  const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;
  lo -= pad;
  hi += pad;

  const y = (v: number) => PAD_T + ((hi - v) / (hi - lo)) * (H - PAD_T - PAD_B);
  const cw = (W - PAD_L - PAD_R) / candles.length;

  // Подписи шкалы считаем от реального диапазона, чтобы ни одна не вышла за картинку
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + (hi - lo) * t);
  const digits = hi >= 1000 ? 0 : hi >= 1 ? 2 : 5;

  return (
    <svg
      className="price-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Свечной график ${symbol}, таймфрейм ${timeframe}, последние ${candles.length} свечей`}
    >
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} stroke="var(--chart-grid)" strokeWidth="1" />
          <text
            x={W - PAD_R + 6}
            y={y(v) + 3.5}
            fill="var(--muted)"
            fontFamily="var(--f-data)"
            fontSize="10"
          >
            {v.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })}
          </text>
        </g>
      ))}

      {candles.map((c, i) => {
        const cx = PAD_L + i * cw + cw / 2;
        const up = c.close >= c.open;
        const color = up ? "var(--up)" : "var(--down)";
        const top = y(Math.max(c.open, c.close));
        const bottom = y(Math.min(c.open, c.close));
        return (
          <g key={c.timestamp}>
            <line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} stroke={color} strokeWidth="1" />
            <rect
              x={cx - cw * 0.3}
              y={top}
              width={Math.max(1, cw * 0.6)}
              height={Math.max(1.5, bottom - top)}
              fill={color}
            />
          </g>
        );
      })}

      {livePrice !== undefined && (
        <g>
          <line
            x1={PAD_L}
            y1={y(livePrice)}
            x2={W - PAD_R}
            y2={y(livePrice)}
            stroke="var(--accent)"
            strokeWidth="1.2"
            strokeDasharray="5 4"
          />
          <text x={PAD_L + 5} y={y(livePrice) - 5} fill="var(--accent)" fontFamily="var(--f-data)" fontSize="10">
            сейчас{" "}
            {livePrice.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })}
          </text>
        </g>
      )}

      <text x={PAD_L} y={H - 5} fill="var(--muted)" fontFamily="var(--f-data)" fontSize="10">
        {candles.length} свечей · {timeframe}
      </text>
    </svg>
  );
}
