# Локальный запуск без Docker

В системе нет Docker, поэтому Postgres и Redis подняты портативными сборками
из `.tools/` (папка в .gitignore, в репозиторий не попадает).

## Поднять окружение

```sh
# Postgres на 5433
.tools/pgsql/bin/pg_ctl.exe -D .tools/pgdata -o "-p 5433" -l .tools/pg.log start

# Redis на 6380
.tools/redis/redis-server.exe --port 6380 --save ""

# всё приложение: api :3001, web :5175, extension — сборка в watch
pnpm dev
```

## Остановить

```sh
.tools/pgsql/bin/pg_ctl.exe -D .tools/pgdata stop
.tools/redis/redis-cli.exe -p 6380 shutdown nosave
```

## Если папки .tools нет (новая машина)

```sh
mkdir -p .tools && cd .tools
curl -L -o pg.zip https://get.enterprisedb.com/postgresql/postgresql-17.2-1-windows-x64-binaries.zip
curl -L -o redis.zip https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip
unzip -q pg.zip && unzip -q redis.zip -d redis
echo postgres > pwfile
./pgsql/bin/initdb.exe -D pgdata -U postgres -A md5 --pwfile=pwfile -E UTF8 && rm pwfile
# запустить Postgres (команда выше), затем:
PGPASSWORD=postgres ./pgsql/bin/createdb.exe -U postgres -h localhost -p 5433 chartmate
cd .. && pnpm --filter @chartmate/api exec prisma migrate deploy
```

Redis 5.0.14 — минимальная версия, которую принимает BullMQ 5 (требует >= 5.0.0).

## Ключи API

`apps/api/.env` создан из `.env.example`. Без ключей работает: авторизация,
журнал сделок, флаги поведения, крипто-котировки и свечи (Binance), RSS-новости.

Требуют ключей:

| Переменная | Что включает |
|---|---|
| `GEMINI_API_KEY` | AI-наблюдения по инструменту (`POST /api/observations/analyze`) |
| `ANTHROPIC_API_KEY` | распознавание скриншота графика в расширении |
| `TWELVE_DATA_API_KEY` | акции и форекс |
| `FRED_API_KEY` | доходности гособлигаций США |
