/**
 * Object storage configuration.
 *
 * STORAGE_DRIVER=local (default) keeps binaries under STORAGE_DIR.
 * STORAGE_DRIVER=minio stores binaries in a private S3-compatible bucket.
 * In both cases the browser only ever receives short-lived HMAC links served
 * by GET /api/v1/files — MinIO credentials and endpoints never leave the API.
 */

export type StorageDriverName = "local" | "minio"

export type MinioConfig = {
  endPoint: string
  port: number
  useSSL: boolean
  accessKey: string
  secretKey: string
  bucket: string
  region: string
}

export type StorageConfig =
  | { driver: "local"; storageDir: string }
  | { driver: "minio"; storageDir: string; minio: MinioConfig }

/** Credentials shipped in docker-compose.yml for local development only. */
const DEV_ONLY_MINIO_SECRETS = new Set([
  "shamli-minio-dev-password",
  "minioadmin",
])

/** S3 bucket naming rules (3–63 chars, lowercase, digits, dots, hyphens). */
const BUCKET_NAME = /^(?!xn--)(?!.*\.\.)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/

export function resolveStorageDriver(
  env: NodeJS.ProcessEnv = process.env
): StorageDriverName {
  const raw = env.STORAGE_DRIVER?.trim().toLowerCase()
  return raw === "minio" ? "minio" : "local"
}

/** Human-readable problems with storage env (empty when valid). */
export function collectStorageEnvErrors(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const errors: string[] = []
  const raw = env.STORAGE_DRIVER?.trim().toLowerCase()
  if (raw && raw !== "local" && raw !== "minio") {
    errors.push(`STORAGE_DRIVER must be "local" or "minio" (got "${raw}")`)
    return errors
  }
  if (resolveStorageDriver(env) !== "minio") return errors

  for (const key of [
    "MINIO_ENDPOINT",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_BUCKET",
  ] as const) {
    if (!env[key]?.trim()) {
      errors.push(`${key} is required when STORAGE_DRIVER=minio`)
    }
  }

  const endpoint = env.MINIO_ENDPOINT?.trim() ?? ""
  if (endpoint && /[/:]/.test(endpoint)) {
    errors.push(
      "MINIO_ENDPOINT must be a host name only (no scheme, port or path); use MINIO_PORT / MINIO_USE_SSL"
    )
  }

  const port = env.MINIO_PORT?.trim()
  if (port && !(Number.isInteger(Number(port)) && Number(port) > 0)) {
    errors.push("MINIO_PORT must be a positive integer")
  }

  const bucket = env.MINIO_BUCKET?.trim() ?? ""
  if (bucket && !BUCKET_NAME.test(bucket)) {
    errors.push(
      "MINIO_BUCKET must be a valid S3 bucket name (3–63 lowercase letters, digits, dots, hyphens)"
    )
  }

  const secret = env.MINIO_SECRET_KEY?.trim() ?? ""
  if (secret && secret.length < 8) {
    errors.push("MINIO_SECRET_KEY must be at least 8 characters")
  }
  if (
    env.NODE_ENV === "production" &&
    (DEV_ONLY_MINIO_SECRETS.has(secret) || /^CHANGE_ME/i.test(secret))
  ) {
    errors.push(
      "MINIO_SECRET_KEY uses a development default or placeholder; set a strong secret in production"
    )
  }

  return errors
}

export function loadStorageConfig(
  env: NodeJS.ProcessEnv = process.env
): StorageConfig {
  const storageDir = env.STORAGE_DIR?.trim() || "uploads"
  if (resolveStorageDriver(env) === "local") {
    return { driver: "local", storageDir }
  }
  const errors = collectStorageEnvErrors(env)
  if (errors.length > 0) {
    throw new Error(`Invalid storage configuration:\n  - ${errors.join("\n  - ")}`)
  }
  const useSSL = ["1", "true", "yes"].includes(
    env.MINIO_USE_SSL?.trim().toLowerCase() ?? ""
  )
  return {
    driver: "minio",
    storageDir,
    minio: {
      endPoint: env.MINIO_ENDPOINT!.trim(),
      port: Number(env.MINIO_PORT?.trim() || (useSSL ? 443 : 9000)),
      useSSL,
      accessKey: env.MINIO_ACCESS_KEY!.trim(),
      secretKey: env.MINIO_SECRET_KEY!.trim(),
      bucket: env.MINIO_BUCKET!.trim(),
      region: env.MINIO_REGION?.trim() || "us-east-1",
    },
  }
}
