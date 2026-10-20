import { resolveSeedAdminConfig } from "../db/seed-admin-config"
import { collectStorageEnvErrors } from "../storage/storage-config"

export type ValidateEnvOptions = {
  /** Validate Super Admin seed credentials (container startup / seed-cli). */
  includeSeedAdmin?: boolean
  env?: NodeJS.ProcessEnv
}

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production"
}

function collectProductionErrors(env: NodeJS.ProcessEnv): string[] {
  const errors: string[] = []

  const sessionSecret = env.SESSION_SECRET?.trim()
  if (!sessionSecret || sessionSecret.length < 32) {
    errors.push(
      "SESSION_SECRET must be set (≥32 random chars). Generate with: openssl rand -base64 48"
    )
  }

  if (!env.PUBLIC_APP_URL?.trim()) {
    errors.push(
      "PUBLIC_APP_URL is required in production (set PUBLIC_PORTAL_URL in Dokploy; compose maps it to PUBLIC_APP_URL)"
    )
  }

  if (!env.CORS_ORIGIN?.trim()) {
    errors.push(
      "CORS_ORIGIN is required in production (compose derives it from PUBLIC_PORTAL_URL and PUBLIC_WEB_URL)"
    )
  }

  if (!env.STORAGE_DIR?.trim()) {
    errors.push(
      "STORAGE_DIR is required in production (compose sets /app/uploads)"
    )
  }

  const paymentProvider = env.PAYMENT_PROVIDER?.trim().toLowerCase()
  if (paymentProvider === "sandbox") {
    errors.push(
      "PAYMENT_PROVIDER must not be sandbox in production (set PAYMENT_PROVIDER=atom)"
    )
  }

  return errors
}

/**
 * Fail fast with a clear, multi-line message when required env vars are missing.
 * Called before migrations/seed in Docker and again when Nest boots.
 */
export function assertRequiredEnv(options: ValidateEnvOptions = {}): void {
  const env = options.env ?? process.env
  const errors: string[] = []

  if (!env.DATABASE_URL?.trim()) {
    errors.push(
      "DATABASE_URL is required (compose derives it from POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB)"
    )
  }

  if (!env.REDIS_URL?.trim()) {
    errors.push(
      "REDIS_URL is required (local: redis://localhost:6380; production: compose derives it from REDIS_PASSWORD)"
    )
  }

  if (!env.SESSION_SECRET?.trim() && !env.BETTER_AUTH_SECRET?.trim()) {
    errors.push(
      "SESSION_SECRET is required (≥32 chars). Copy from apps/api/.env.example"
    )
  } else if (
    env.SESSION_SECRET?.trim() &&
    env.SESSION_SECRET.trim().length < 32
  ) {
    errors.push("SESSION_SECRET must be at least 32 characters")
  }

  errors.push(...collectStorageEnvErrors(env))

  if (isProduction(env)) {
    errors.push(...collectProductionErrors(env))
  }

  if (options.includeSeedAdmin) {
    try {
      resolveSeedAdminConfig(env)
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Invalid Super Admin seed config"
      )
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors.map((line) => `  - ${line}`).join("\n")}`
    )
  }
}
