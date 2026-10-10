import { useEffect, useState } from "react";

import { fetchBehaviorFlags, type BehaviorFlagRecord } from "./api";

/** Расшифровки флагов: в базе лежит только код, человеку нужен текст. */
const FLAG_LABELS: Record<BehaviorFlagRecord["kind"], { title: string; hint: string; critical: boolean }> = {
  NO_STOP: { title: "Вход без стопа", hint: "Сделка открыта без заранее заданного стопа", critical: true },
  REVENGE: { title: "Отыгрыш", hint: "Новый вход сразу после убыточной сделки", critical: true },
  OVERTRADING: { title: "Перебор сделок", hint: "Входов за день заметно больше обычного", critical: false },
  COUNTER_TREND: { title: "Против тренда", hint: "Вход против направления старшего таймфрейма", critical: false },
  SIZE_CREEP: { title: "Рост объёма", hint: "Размер позиции растёт от сделки к сделке", critical: false },
};

const RING_R = 30;
const RING_LENGTH = 2 * Math.PI * RING_R;

export interface DisciplineStats {
  total: number;
  planned: number;
}

/**
 * Главный показатель продукта: доля сделок, план по которым был готов до входа.
 * Считается по журналу на клиенте — отдельного эндпоинта под это нет.
 */
export function DisciplinePanel({ stats }: { stats: DisciplineStats }) {
  const [flags, setFlags] = useState<BehaviorFlagRecord[]>([]);

  useEffect(() => {
    fetchBehaviorFlags()
      .then(setFlags)
      .catch(() => {
        // флаги не критичны для экрана: при ошибке просто не показываем блок
      });
  }, [stats.total]);

  const share = stats.total ? Math.round((stats.planned / stats.total) * 100) : 0;
  const filled = (share / 100) * RING_LENGTH;

  return (
    <section className="panel discipline">
      <div className="panel-head">
        <h2>Дисциплина</h2>
        <span className="panel-hint">по всем записям</span>
      </div>

      <div className="discipline-body">
        <svg
          className="discipline-ring"
          width="74"
          height="74"
          viewBox="0 0 74 74"
          role="img"
          aria-label={`План был готов заранее в ${share} процентах сделок`}
        >
          <circle cx="37" cy="37" r={RING_R} fill="none" stroke="var(--line)" strokeWidth="8" />
          <circle
            cx="37"
            cy="37"
            r={RING_R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${RING_LENGTH}`}
            transform="rotate(-90 37 37)"
          />
          <text
            x="37"
            y="42"
            textAnchor="middle"
            fill="var(--ink)"
            fontFamily="var(--f-data)"
            fontSize="16"
            fontWeight="600"
          >
            {share}%
          </text>
        </svg>

        <div className="discipline-text">
          <strong>План был готов заранее</strong>
          <span>
            {stats.planned} из {stats.total} {stats.total === 1 ? "сделки" : "сделок"}
          </span>
          {stats.total === 0 && <span className="discipline-empty">Запишите первую сделку, чтобы считать долю.</span>}
        </div>
      </div>

      {flags.length > 0 && (
        <ul className="flag-list">
          {flags.slice(0, 4).map((flag) => {
            const label = FLAG_LABELS[flag.kind];
            return (
              <li key={flag.id} className={`flag-item${label.critical ? " critical" : ""}`}>
                <span className="flag-sev" aria-hidden="true" />
                <div>
                  <div className="flag-title">{label.title}</div>
                  <div className="flag-hint">{label.hint}</div>
                  <div className="flag-when">{new Date(flag.detectedAt).toLocaleString("ru-RU")}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
