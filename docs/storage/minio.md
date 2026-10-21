# Object storage (MinIO)

Survey/property images (and import/export workbooks) are stored in a **private** MinIO bucket
through the existing `StorageService` (`apps/api/src/storage/`). Browsers never talk to MinIO:
the API mints short-lived HMAC links (`/api/v1/files?key=…&exp=…&sig=…`, default 5–10 min) after
the RBAC check and streams the object. MinIO credentials exist only in the API container.

## Configuration

| Variable | Purpose |
| --- | --- |
| `STORAGE_DRIVER` | `local` (default, files under `STORAGE_DIR`) or `minio` |
| `MINIO_ENDPOINT` | host name only (`minio` in Docker, `localhost` locally) |
| `MINIO_PORT`, `MINIO_USE_SSL` | API port (9000) / `true` when MinIO is behind TLS |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | API credentials (least-privilege user, see below) |
| `MINIO_BUCKET` | `shamli-survey-images`; created on API start if missing (no public policy) |
| `MINIO_REGION` | default `us-east-1` |
| `STORAGE_SIGNING_SECRET` | signs `/api/v1/files` links (falls back to `SESSION_SECRET`) |
| `IMAGE_MIGRATION_ALLOWED_HOSTS` | hosts the migration may download from (default `backend.sdvedutech.in`, https only) |
| `IMAGE_MIGRATION_MAX_BYTES` | per-image limit (default 15 MB) |

Validation runs at startup (`validate-env.ts`): missing values, endpoints with a scheme, invalid
bucket names, short secrets, and dev/placeholder secrets in production stop the API.
`/api/v1/health/ready` includes `storage` (bucket reachable) and `storageDriver`.

## Local development

`docker compose up -d` starts MinIO on `127.0.0.1:9000` (API) and `127.0.0.1:9001` (console,
dev-only credentials from `docker-compose.yml`). Set the `MINIO_*` values from
`apps/api/.env.example`. Integration tests: `MINIO_TEST_ENDPOINT=localhost MINIO_TEST_ACCESS_KEY=… MINIO_TEST_SECRET_KEY=… pnpm --filter api test storage.minio`.

> The pinned image `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` is the last community image
> published upstream. Override with `MINIO_IMAGE` if you build or mirror a newer release.

## Production (Dokploy)

`docker-compose.prod.yml` runs `minio` on the internal network only (`expose: 9000`, no host
port, no Traefik domain). Set in the Dokploy Environment tab: `MINIO_ROOT_USER`,
`MINIO_ROOT_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`.

Create a least-privilege API user once (root credentials stay with administrators):

```bash
docker compose exec minio sh -c '
  mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
  mc mb --ignore-existing local/shamli-survey-images
  cat > /tmp/api-policy.json <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket"],"Resource":["arn:aws:s3:::shamli-survey-images"]},
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::shamli-survey-images/*"]}]}
EOF
  mc admin policy create local shamli-api /tmp/api-policy.json
  mc admin user add local "<MINIO_ACCESS_KEY>" "<MINIO_SECRET_KEY>"
  mc admin policy attach local shamli-api --user "<MINIO_ACCESS_KEY>"'
```

Console access: do not publish port 9001. Use an SSH tunnel to the host and
`docker compose exec minio …` or temporarily `docker run --network <stack-net> -p 127.0.0.1:9001:9001 …`.
TLS is not needed on the internal Docker network; if MinIO is ever moved off-host, put it behind
TLS and set `MINIO_USE_SSL=true`.

## Object keys

| Data | Key |
| --- | --- |
| Imported / migrated survey images | `property-images/<ulb>/ward-<nnn>/<property id>/<image-type>--<image name>` |
| Images uploaded in the portal | `surveys/<survey db id>/<timestamp>-<file name>` |
| Import workbooks and rollback artefacts | `imports/…` |
| Exports | `exports/…` |

Object metadata: `sha256`, `property-id`, `image-type`, `source-name`; DB keeps `checksumSha256`,
`size`, `mimeType`, `storageStatus` (`PENDING_MIGRATION` / `AVAILABLE` / `FAILED`),
`migrationAttempts`, `migrationError`, `migratedAt`.

Uploads are validated by magic bytes (JPEG/PNG/WebP/GIF/PDF), not by the client MIME type, and
by size (`IMPORT_MAX_FILE_SIZE_MB`). Deleting an attachment also deletes its object when no other
row references it.

## Migrating legacy images

```bash
node dist/cli/migrate-images-to-minio.js --ward 3 --dry-run
node dist/cli/migrate-images-to-minio.js --ward 3 [--limit 20] [--concurrency 4]
node dist/cli/migrate-images-to-minio.js --ward 3 --retry-failed      # retry FAILED rows
node dist/cli/migrate-images-to-minio.js --ward 3 --verify-available  # re-check objects
```

Each image is fetched (https, allow-listed host, redirects refused, 30 s timeout, 3 tries with
backoff for transient errors), checked (non-empty, declared length, magic bytes, JPEG/PNG end
marker, size limit), hashed, uploaded to its stable key, read back and only then marked
`AVAILABLE`. An object already present with the same SHA-256 is not uploaded again. Reports:
`tmp/reports/image-migration-*.{json,md}`. The legacy host sends
`Cross-Origin-Resource-Policy: same-origin`, so images cannot be hot-linked from it — migration is
required for them to display in the portal.

## Backup and restore

```bash
# Backup (on the host): mirror the bucket to a dated directory or another S3 target
docker compose exec minio sh -c 'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc mirror --preserve local/shamli-survey-images /data/.backup-$(date +%F)'
# or from an admin machine: mc mirror prod/shamli-survey-images ./backup/shamli-survey-images
# Restore
mc mirror --preserve ./backup/shamli-survey-images prod/shamli-survey-images
```

Back up the `shamli_minio_data` volume together with the Postgres dump — DB rows reference
object keys. After a restore run `migrate-images-to-minio.js --verify-available` and the
reconciliation.
