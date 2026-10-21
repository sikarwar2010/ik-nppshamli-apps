import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const srcPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "portal-api-fetch.ts"
)
const nextConfigPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../next.config.ts"
)

describe("portal-api-fetch internal URL", () => {
  const src = readFileSync(srcPath, "utf8")

  it("normalizes API_INTERNAL_URL to origin only", () => {
    assert.match(src, /export function normalizeApiInternalOrigin/)
    assert.match(src, /new URL\(trimmed\)\.origin/)
    assert.match(src, /normalizeApiInternalOrigin\(raw\)/)
  })

  it("logs api build id and session cookie state on HTTP errors", () => {
    assert.match(src, /apiBuildId/)
    assert.match(src, /hasSessionCookie/)
    assert.match(src, /route_missing_or_wrong_backend/)
  })

  it("uses node:http to Nest instead of Next-patched global fetch", () => {
    assert.match(src, /from "node:http"/)
    assert.match(src, /from "node:dns\/promises"/)
    assert.match(src, /export (?:async )?function upstreamApiRequest/)
    assert.match(src, /dns\.lookup/)
    assert.match(src, /connectHost/)
    assert.match(src, /requestHeaders\.host/)
    assert.match(src, /agent:\s*false/)
    // Local Windows: localhost → IPv4 only (Nest binds 0.0.0.0, not ::1).
    assert.match(src, /hostname === "localhost"/)
    assert.match(src, /family:\s*4/)
    assert.doesNotMatch(src, /isAllowedApiConnectAddress/)
    assert.doesNotMatch(src, /127\.0\.0\.1:7787/)
    assert.match(src, /upstreamApiRequest\(url/)
    assert.doesNotMatch(
      src,
      /await fetch\(url,\s*\{\s*method,\s*headers,\s*cache: "no-store"/
    )
  })

  it("exposes a longer multipart upload timeout separate from default API timeout", () => {
    assert.match(src, /PORTAL_API_TIMEOUT_MS = 10_000/)
    assert.match(src, /PORTAL_API_UPLOAD_TIMEOUT_DEFAULT_MS = 120_000/)
    assert.match(src, /export function resolvePortalApiUploadTimeoutMs/)
    assert.match(src, /export function isPortalApiUploadRequest/)
    assert.match(src, /export function resolvePortalApiTimeoutMs/)
    assert.match(src, /PORTAL_API_UPLOAD_TIMEOUT_MS/)
    assert.match(src, /multipart\/form-data/)
    assert.match(src, /\/imports\/upload/)
    assert.match(src, /attachments/)
  })

  it("distinguishes abort/timeout errors for upload timeout handling", () => {
    assert.match(src, /export function isAbortTimeoutError/)
    assert.match(src, /AbortError/)
    assert.match(src, /TimeoutError/)
  })
})

describe("portal next.config does not rewrite /api to api:4000", () => {
  const src = readFileSync(nextConfigPath, "utf8")

  it("does not register http://api:4000 as a Next rewrite destination", () => {
    assert.doesNotMatch(src, /rewrites\s*\(/)
    assert.doesNotMatch(src, /api:4000/)
    assert.doesNotMatch(src, /API_INTERNAL_URL/)
  })
})

describe("production compose uses unique API DNS alias", () => {
  const composePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../docker-compose.prod.yml"
  )
  const src = readFileSync(composePath, "utf8")

  it("registers shamli-api on the API service and uses it for portal/web", () => {
    assert.match(src, /aliases:\s*\n\s+- shamli-api/)
    assert.match(src, /API_INTERNAL_URL: http:\/\/shamli-api:4000/)
    assert.doesNotMatch(src, /chhata-api/)
    assert.doesNotMatch(src, /API_INTERNAL_URL: http:\/\/api:4000/)
    assert.doesNotMatch(src, /container_name:/)
  })
})
