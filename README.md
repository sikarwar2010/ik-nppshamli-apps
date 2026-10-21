# Nagar Panchayat Chhata Platform

Municipal survey, property-data, reporting, RBAC, and payment platform for **Nagar Panchayat Chhata, Mathura**.

## Stack

- `apps/portal` — Next.js staff portal
- `apps/api` — NestJS HTTP API (Prisma, Nest session auth + RBAC, BullMQ, local file storage, Atom NDPS)
- `apps/web` — Next.js citizen site
- `packages/ui` — shared shadcn/Base UI components
- `packages/types` / `packages/api-client` — shared types and fetch client

## Quick start

```bash
# 1. Infra
docker compose up -d

# 2. Env
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/portal/.env.example apps/portal/.env
cp apps/web/.env.example apps/web/.env

# 3. DB
pnpm db:generate
pnpm --filter api prisma:migrate
pnpm db:seed

# 4. Dev (host processes; infra from step 1)
pnpm dev
# Or separately: pnpm dev:api / pnpm dev:portal / pnpm dev:web
```

Day-to-day local work uses **infra-only** Compose (`postgres` / `redis`) plus host `pnpm` watchers. If you previously ran the production-like app profile, stop those containers first so host ports stay free:

```bash
docker compose --profile app stop
docker compose up -d
```

On Windows, stopping `pnpm`/`turbo` with Ctrl+C may show `Terminate batch job (Y/N)?` and exit code `1`. That is shell shutdown noise after a successful session — confirm health with `curl http://localhost:4000/api/v1/health` while the stack is running, not the stop exit code.

Local Docker ports (avoids clashes with other stacks like `api-survey-local`):

| Service  | Host port |
| -------- | --------- |
| Postgres | `5433`    |
| Redis    | `6380`    |

Default admin email (local seed, overridable): `SEED_ADMIN_EMAIL` in `apps/api/.env`. Password comes from `SEED_ADMIN_PASSWORD` in that same file — never from source code.

## Production (Dokploy)

Dokploy owns Traefik, TLS, and the Environment tab. Use `docker-compose.prod.yml` (no Caddy, no host ports).

1. Create a **Compose** service. Compose path: `docker-compose.prod.yml`.
2. Advanced → enable **Isolated Deployments**.
3. Environment → paste `.env.production.example`, then set real hosts and secrets. Dokploy writes this as `.env`.
4. Domains (HTTPS / Let's Encrypt):

| Service  | Port   | Host                               |
| -------- | ------ | ---------------------------------- |
| `web`    | `3001` | citizen site (`PUBLIC_WEB_URL`)    |
| `portal` | `3000` | admin portal (`PUBLIC_PORTAL_URL`) |

5. Internal API URL is `http://chhata-api:4000` (Compose alias on the `api` service). Do not use `http://api:4000`: Dokploy Traefik attaches a shared network, and Docker merges A records for the short name `api` with any other stack that also has a service named `api`.
6. Staff auth: portal BFF proxies `/api/v1/auth/*` to Nest; session cookie `chhata_session` (HttpOnly, SameSite=Lax, Secure on HTTPS). Active sessions live in Redis; PostgreSQL stores durable session metadata.
7. Do not map domains to Postgres or Redis. Do not set `container_name` in production Compose.

Full local Docker (same architecture as production):

```bash
docker compose --profile app up --build
```

`DATABASE_URL` / `REDIS_URL` are set in Compose from `POSTGRES_*` and `REDIS_PASSWORD`. Do not point them at `localhost`. Survey imports and attachments are stored on the `chhata_uploads` volume (`STORAGE_DIR=/app/uploads`).

On each API container start: **migrations** then **idempotent Super Admin seed** then the Nest process. Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in Dokploy Environment (required in production). The seed uses that same `DATABASE_URL`.

## Commands

| What                                   | Command                                              |
| -------------------------------------- | ---------------------------------------------------- |
| Infra only (Postgres 5433, Redis 6380) | `docker compose up -d`                               |
| Check local app ports free             | `pnpm dev:check-ports`                               |
| All local apps (API + portal + web)    | `pnpm dev`                                           |
| Local API                              | `pnpm dev:api`                                       |
| Local portal                           | `pnpm dev:portal`                                    |
| Local citizen web                      | `pnpm dev:web`                                       |
| Stop Docker app profile (free 3000/4000) | `docker compose --profile app stop`                |
| Generate Prisma client                 | `pnpm db:generate`                                   |
| Dev migrations                         | `pnpm db:migrate`                                    |
| Production migrations                  | `pnpm --filter api prisma:deploy`                    |
| Seed Super Admin                       | `pnpm db:seed`                                       |
| Production-like local stack            | `docker compose --profile app up --build`            |
| Production compose config check        | `pnpm docker:prod:config`                            |
| Health                                 | `curl http://localhost:4000/api/v1/health`           |
| Readiness                              | `curl http://localhost:4000/api/v1/health/ready`     |
| Unauthenticated session                | `curl -i http://localhost:4000/api/v1/auth/me` (401) |

Production deploys must run **one** API replica (or many replicas of the **same** image sharing Redis + Postgres). Do not leave an old `api` container on the same Docker network during a rolling update — Compose DNS `api` round-robins every task with that name, including stale ones.

## Shamli operations docs

| Topic | Doc |
| --- | --- |
| Survey workbook import, mapping, rollback | [docs/shamli/excel-import.md](docs/shamli/excel-import.md) |
| Ward 3 (Lajpat Rai) import & reconciliation report | [docs/shamli/ward-03-lajpat-rai-reconciliation.md](docs/shamli/ward-03-lajpat-rai-reconciliation.md) |
| MinIO object storage, image migration, backups | [docs/storage/minio.md](docs/storage/minio.md) |
| CI/CD, deployment, rollback | [docs/operations/ci-cd.md](docs/operations/ci-cd.md) |
| Websites (Shamli / Chhata), content rules, reference inventory | [docs/websites/README.md](docs/websites/README.md) |

Local ports for this stack (root `.env`, avoids other local projects): Postgres 5434,
Redis 6381, Mailpit 1026/8026, MinIO 9000/9001 (localhost only).

## Fixtures

- Survey Excel: `fixtures/survey/` (copied from source; originals never modified)
- Payment docs: `docs/payments/`
