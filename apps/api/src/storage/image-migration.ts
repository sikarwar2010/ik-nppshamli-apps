import { createHash } from "node:crypto"

import { IMAGE_TYPES, looksComplete, sniffFileType } from "./file-signature"

export type FetchedImage = {
  body: Buffer
  contentType: string
  sha256: string
  declaredContentType: string | null
}

export class ImageFetchError extends Error {
  constructor(
    message: string,
    /** Transient errors (network, 5xx, 429) are retried; others are not. */
    readonly retryable: boolean
  ) {
    super(message)
  }
}

export function allowedSourceHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.IMAGE_MIGRATION_ALLOWED_HOSTS ?? "backend.sdvedutech.in")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

export function maxImageBytes(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.IMAGE_MIGRATION_MAX_BYTES)
  return Number.isInteger(n) && n > 0 ? n : 15 * 1024 * 1024
}

/**
 * Only https URLs on an allow-listed host are fetched. Workbook URLs are
 * untrusted input, so this prevents the migration from being pointed at
 * internal services (SSRF).
 */
export function assertAllowedSourceUrl(url: string, hosts = allowedSourceHosts()): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ImageFetchError(`Invalid source URL: ${url}`, false)
  }
  if (parsed.protocol !== "https:") {
    throw new ImageFetchError(`Source URL must use https: ${url}`, false)
  }
  if (!hosts.includes(parsed.hostname.toLowerCase())) {
    throw new ImageFetchError(
      `Source host ${parsed.hostname} is not in IMAGE_MIGRATION_ALLOWED_HOSTS`,
      false
    )
  }
  return parsed
}

/** Validate downloaded bytes: real image, complete, within size limits. */
export function verifyImageBytes(
  body: Buffer,
  declaredContentType: string | null,
  declaredLength: number | null,
  limit = maxImageBytes()
): FetchedImage {
  if (body.length === 0) throw new ImageFetchError("Empty response body", true)
  if (declaredLength != null && declaredLength !== body.length) {
    throw new ImageFetchError(
      `Truncated download: expected ${declaredLength} bytes, got ${body.length}`,
      true
    )
  }
  if (body.length > limit) {
    throw new ImageFetchError(`Image is ${body.length} bytes (limit ${limit})`, false)
  }
  const sniffed = sniffFileType(body)
  if (!sniffed || !IMAGE_TYPES.has(sniffed)) {
    throw new ImageFetchError(
      `Content is not a JPEG/PNG/WebP/GIF image (declared ${declaredContentType ?? "unknown"})`,
      false
    )
  }
  if (!looksComplete(body, sniffed)) {
    throw new ImageFetchError(`${sniffed} data is incomplete (missing end marker)`, true)
  }
  return {
    body,
    contentType: sniffed,
    declaredContentType,
    sha256: createHash("sha256").update(body).digest("hex"),
  }
}

export async function fetchSourceImage(
  url: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<FetchedImage> {
  assertAllowedSourceUrl(url)
  const fetchImpl = options.fetchImpl ?? fetch
  let res: Response
  try {
    res = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      headers: { "User-Agent": "nppshamli-image-migration/1.0" },
    })
  } catch (err) {
    throw new ImageFetchError(`Network error: ${(err as Error).message}`, true)
  }
  if (!res.ok) {
    throw new ImageFetchError(
      `HTTP ${res.status} from source`,
      res.status >= 500 || res.status === 429 || res.status === 408
    )
  }
  const lengthHeader = res.headers.get("content-length")
  const declaredLength = lengthHeader && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null
  if (declaredLength != null && declaredLength > maxImageBytes()) {
    throw new ImageFetchError(`Image is ${declaredLength} bytes (limit ${maxImageBytes()})`, false)
  }
  const body = Buffer.from(await res.arrayBuffer())
  return verifyImageBytes(body, res.headers.get("content-type"), declaredLength)
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1000
): Promise<{ value: T; tries: number }> {
  let lastError: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return { value: await fn(), tries: i }
    } catch (err) {
      lastError = err
      const retryable = !(err instanceof ImageFetchError) || err.retryable
      if (!retryable || i === attempts) break
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (i - 1)))
    }
  }
  throw lastError
}
