# CLAUDE.md — ChartMate

## Что это

ChartMate — ИИ-компаньон трейдера. Chrome-расширение видит вкладку с графиком (TradingView, биржа), распознаёт контекст (тикер, таймфрейм, нарисованные пользователем уровни, включённые индикаторы), затем подтягивает реальные OHLCV-данные по API и выдаёт структурированное наблюдение + вопросы по риск-менеджменту.

Это не сигнальный сервис. Продукт — журнал сделок и инструмент дисциплины.

## Железное правило продукта (нарушение = баг P0)

Система никогда не выдаёт:
- направленный прогноз («цена пойдёт вверх», «лонг», «шорт», «buy», «sell»)
- целевые цены как рекомендацию
- вероятности движения в процентах
- временны́е прогнозы («в течение часа вырастет»)

Система выдаёт:
- описание того, что объективно есть на графике и в данных
- вопросы пользователю («где стоп?», «какой R:R?», «это уже 3-й вход в этот уровень сегодня»)
- флаги поведенческого риска на основе истории пользователя
- статистику по его собственным сделкам

Есть слой `GuardrailValidator`, через который проходит любой LLM-ответ перед отдачей клиенту. Он режет по schema + по стоп-словарю. Если валидатор сработал — ответ не показывается, в лог пишется инцидент.

## Стек

Монорепо: pnpm + Turborepo

- `apps/extension` — Chrome MV3, React 18 + TypeScript + Vite (`@crxjs/vite-plugin`), Side Panel API
- `apps/api` — NestJS + Prisma + PostgreSQL + BullMQ (Redis)
- `apps/web` — Vite/React/TS, дашборд-журнал (деплой Vercel)
- `packages/shared` — zod-схемы, типы, константы, стоп-словарь гардрейлов

Деплой: API + Postgres + Redis на Railway, web на Vercel.

## Архитектура потока

```
[Chrome tab: TradingView]
   ↓ chrome.tabs.captureVisibleTab (по триггеру, НЕ каждый кадр)
[Extension: pHash предыдущего кадра → diff > порога ИЛИ ручной клик]
   ↓ downscale до 1024px, JPEG q0.7, base64
[POST /api/sessions/:id/frames]
   ↓ BullMQ queue: vision
[VisionService] Claude vision → строгий JSON:
   { ticker, timeframe, drawnLevels[], indicators[], chartType, confidence }
   ↓ если confidence < 0.6 → вернуть "не могу разобрать график", НЕ гадать
[MarketDataService] REST биржи по ticker+timeframe → настоящий OHLCV
   ↓
[AnalysisService] контекст-пакет (vision JSON + OHLCV + история сделок юзера)
   → LLM → ObservationSchema
   ↓
[GuardrailValidator] ← блокирует направленные формулировки
   ↓ SSE
[Side Panel UI]
   ↓ persist
[Postgres: Frame, Analysis, JournalEntry]
```

Ключевой принцип: vision отвечает только на вопрос «что пользователь сейчас видит». Цифры для анализа берутся из API биржи, а не считываются с пикселей. Это дешевле и точнее.

## Экономия на vision

- pHash-фильтр на клиенте: кадр уходит только при изменении > 8% битов
- Дебаунс 15 сек между авто-анализами
- Кэш: если ticker+timeframe не менялись < 60 сек — переиспользовать прошлый vision-результат, обновить только OHLCV
- Free-тариф: жёсткий счётчик 20 анализов/мес в Postgres, проверка до постановки в очередь

## Модели данных (Prisma, минимум)

```
User        id, tgId?, email, plan(FREE|PRO), analysesUsedThisPeriod, periodResetAt
Session     id, userId, startedAt, endedAt, ticker?, timeframe?
Frame       id, sessionId, phash, storageKey?, createdAt
Analysis    id, frameId, visionJson Json, marketJson Json, observationJson Json,
            guardrailFlagged Bool, latencyMs, tokenCost
JournalEntry id, userId, ticker, side?, entry?, stop?, target?, rr?, notes,
             plannedBeforeEntry Bool, outcome?, closedAt?
BehaviorFlag id, userId, kind(OVERTRADING|REVENGE|NO_STOP|COUNTER_TREND|SIZE_CREEP),
             detectedAt, payload Json
```

## Конвенции кода

- TypeScript strict, `noUncheckedIndexedAccess: true`
- Валидация всех границ через zod, схемы живут в `packages/shared` и импортируются обоими приложениями
- NestJS: модуль на домен (vision, market, analysis, journal, billing, telegram)
- Никаких `any`. Никаких ключей API в расширении — все LLM-вызовы только через бэкенд
- Ошибки наружу — типизированные коды, не строки
- Комментарии и UI-тексты — на русском, имена в коде — на английском

## Приватность (писать в README и в онбординг)

- Скриншот вкладки — чувствительные данные. Кадры не хранятся по умолчанию: анализируются в памяти и удаляются, в БД остаётся только pHash + извлечённый JSON
- Хранение кадров — отдельный opt-in тумблер, дефолт OFF
- Расширение запрашивает `activeTab`, а не `<all_urls>`
- Захват идёт только пока сессия явно активна, с видимым индикатором записи в side panel

## Юрисдикция

Юрлицо в ЕС. В UI, лендинге и сторе обязателен дисклеймер: инструмент образовательный, не является инвестиционной рекомендацией. Формулировки продукта строятся вокруг слов «наблюдение», «журнал», «дисциплина», «статистика» — не «сигнал», не «прогноз».
