# CI/CD

Git provider: GitHub · Deployment: Dokploy (Docker Compose, `docker-compose.prod.yml`).

## Continuous integration — `.github/workflows/ci.yml`

Runs on every pull request and push to `main` (and is reused by the deploy workflow).

| Job | Steps |
| --- | --- |
| **verify** | `pnpm install --frozen-lockfile` → `prisma validate` → `prisma migrate deploy` on an empty Postgres 16 → **drift check** (`prisma migrate diff --exit-code`: schema ≡ migrations) → `pnpm typecheck` → `pnpm lint` → `pnpm test` (API unit + MinIO integration against a real MinIO, portal tests) → API e2e (`--runInBand`, Postgres + Redis services) → `docker compose config` (dev + prod) → `pnpm build` (Shamli website) → bundle check: no Chhata content in the Shamli build → Chhata website build + bundle check: no Shamli content |
| **security** | `pnpm audit --prod` (fails on critical; full report on high) · gitleaks secret scan of the tree (`.gitleaks.toml`) |
| **docker** | Builds `api`, `portal`, `web` images from `docker/*.Dockerfile` (GHA layer cache, not pushed) |

Caching: pnpm store via `actions/setup-node`, Docker layers via `type=gha`. Required checks
should be enforced with branch protection on `main` (Settings → Branches → require *verify*,
*security*, *docker*).

Known audit findings (2026-10-21, after patching): 2 high — `deepmerge-ts` (inside Prisma) and
`sharp` (inside Next) need upstream major releases; 5 moderate. Patched in
`pnpm-workspace.yaml` overrides: proxy-addr, multer, lodash, fast-uri, source-map-js,
brace-expansion@2, mysql2; `next` catalog 16.3.4 → 16.3.8. Remove overrides once upstream ranges
include the fixes.

## Continuous deployment — `.github/workflows/deploy.yml`

Trigger: push a tag `vX.Y.Z` (or *Run workflow* with an existing tag).

1. **ci** — the full CI workflow for that commit.
2. **publish** — versioned images to GHCR: `ghcr.io/<repo>/{api,portal,web}:vX.Y.Z` and `:sha-<sha>`.
3. **deploy** (GitHub environment `production`, required reviewers ⇒ nothing ships unreviewed):
   - validates configuration without printing values;
   - **pre-deploy backup**: `pg_dump -Fc` over SSH into `~/backups/shamli/` (when SSH secrets
     are configured; otherwise a warning and Dokploy scheduled backups apply);
   - triggers the Dokploy deploy webhook. Dokploy builds the compose stack; the API container runs
     `prisma migrate deploy` before starting (migrations must be reviewed and backward compatible —
     additive columns/indexes like `20261021000000_…`; never destructive);
   - waits for `/api/v1/health/ready` via the portal (Postgres, Redis **and object storage**);
   - smoke tests: portal `/login`, website `/`, `/propertytax`, `/sitemap.xml`, public property-tax
     API through the website, and `401` for an unauthenticated staff API call;
   - writes a summary with the rollback procedure.

### Configuration

GitHub → Settings → Environments → `production`:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `DOKPLOY_DEPLOY_WEBHOOK` | Dokploy compose → Deployments → webhook URL |
| Secret (optional) | `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_SSH_KNOWN_HOSTS` | backup user with `docker exec` rights only |
| Variable | `PUBLIC_PORTAL_URL`, `PUBLIC_WEB_URL` | e.g. `https://portal.nppshamli.in`, `https://nppshamli.in` |
| Variable (optional) | `DEPLOY_PG_CONTAINER` | Postgres container name on the host |

Application secrets (`SESSION_SECRET`, `POSTGRES_*`, `REDIS_PASSWORD`, `MINIO_*`, `SEED_ADMIN_*`,
Atom keys) live only in Dokploy's Environment tab — see `.env.production.example`. Configure the
Dokploy compose app to deploy the branch/commit the tag points to (`main`).

## Rollback

1. **Application**: re-run *Deploy* with the previous tag (or Dokploy → Deployments → redeploy the
   previous deployment). Additive migrations are compatible with the previous release, so no DB
   change is needed.
2. **Data** (only if a migration or import must be reverted):
   `pg_restore --clean --if-exists -d "$POSTGRES_DB" ~/backups/shamli/pre-deploy-<stamp>.dump`
   inside the Postgres container, with the API stopped. Imports have a finer-grained rollback:
   `node dist/cli/rollback-shamli-import.js --job <id>` (docs/shamli/excel-import.md).
3. **Objects**: restore the bucket with `mc mirror` (docs/storage/minio.md).

## Never in CI/CD

No secrets printed (values are only tested for presence), no `prisma migrate reset`/`db push`, no
automatic destructive SQL, no deploy without the `production` approval, no skipping tests.
