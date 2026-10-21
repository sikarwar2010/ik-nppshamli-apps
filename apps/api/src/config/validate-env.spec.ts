import { assertRequiredEnv } from "./validate-env"

describe("assertRequiredEnv", () => {
  const baseProdEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@postgres:5432/chhata?schema=public",
    SESSION_SECRET: "x".repeat(32),
    REDIS_URL: "redis://:secret@redis:6379",
    PUBLIC_APP_URL: "https://portal.example.com",
    CORS_ORIGIN: "https://portal.example.com,https://www.example.com",
    STORAGE_DIR: "/app/uploads",
    SEED_ADMIN_EMAIL: "admin@example.com",
    SEED_ADMIN_PASSWORD: "strong-pass-1",
  }

  it("passes when production env is complete", () => {
    expect(() =>
      assertRequiredEnv({ env: baseProdEnv, includeSeedAdmin: true })
    ).not.toThrow()
  })

  it("lists missing production variables", () => {
    expect(() =>
      assertRequiredEnv({
        env: {
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://u:p@postgres:5432/chhata",
        },
        includeSeedAdmin: true,
      })
    ).toThrow(/SESSION_SECRET/)
  })

  it("rejects sandbox payment provider in production", () => {
    expect(() =>
      assertRequiredEnv({
        env: {
          ...baseProdEnv,
          PAYMENT_PROVIDER: "sandbox",
        },
        includeSeedAdmin: true,
      })
    ).toThrow(/PAYMENT_PROVIDER/)
  })

  it("rejects placeholder session and signing secrets in production", () => {
    expect(() =>
      assertRequiredEnv({
        env: {
          ...baseProdEnv,
          SESSION_SECRET: "CHANGE_ME_at_least_32_random_chars",
        },
      })
    ).toThrow(/SESSION_SECRET uses a placeholder/)
    expect(() =>
      assertRequiredEnv({
        env: {
          ...baseProdEnv,
          SESSION_SECRET: "change-me-to-a-long-random-secret-at-least-32-chars",
        },
      })
    ).toThrow(/SESSION_SECRET uses a placeholder/)
    expect(() =>
      assertRequiredEnv({
        env: {
          ...baseProdEnv,
          STORAGE_SIGNING_SECRET: "CHANGE_ME_at_least_32_random_chars",
        },
      })
    ).toThrow(/STORAGE_SIGNING_SECRET uses a placeholder/)
  })

  it("requires a strong STORAGE_SIGNING_SECRET in production when set", () => {
    expect(() =>
      assertRequiredEnv({
        env: { ...baseProdEnv, STORAGE_SIGNING_SECRET: "short" },
      })
    ).toThrow(/STORAGE_SIGNING_SECRET must be at least 32 characters/)
    expect(() =>
      assertRequiredEnv({
        env: { ...baseProdEnv, STORAGE_SIGNING_SECRET: "s".repeat(32) },
      })
    ).not.toThrow()
  })

  it("requires DATABASE_URL in all environments", () => {
    expect(() =>
      assertRequiredEnv({
        env: { NODE_ENV: "development" },
      })
    ).toThrow(/DATABASE_URL/)
  })

  it("requires REDIS_URL in all environments", () => {
    expect(() =>
      assertRequiredEnv({
        env: {
          NODE_ENV: "development",
          DATABASE_URL: "postgresql://u:p@localhost:5433/chhata",
          SESSION_SECRET: "x".repeat(32),
        },
      })
    ).toThrow(/REDIS_URL/)
  })

  it("includes seed admin errors when requested", () => {
    expect(() =>
      assertRequiredEnv({
        env: {
          ...baseProdEnv,
          SEED_ADMIN_EMAIL: undefined,
          SEED_ADMIN_PASSWORD: undefined,
          SUPER_ADMIN_EMAIL: undefined,
          SUPER_ADMIN_PASSWORD: undefined,
        },
        includeSeedAdmin: true,
      })
    ).toThrow(/SEED_ADMIN_EMAIL/)
  })
})
