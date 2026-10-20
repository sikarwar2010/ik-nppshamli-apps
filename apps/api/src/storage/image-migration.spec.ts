import { looksComplete, sniffFileType } from "./file-signature"
import {
  ImageFetchError,
  assertAllowedSourceUrl,
  fetchSourceImage,
  verifyImageBytes,
  withRetries,
} from "./image-migration"

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.alloc(32, 7),
  Buffer.from([0xff, 0xd9]),
])
const TRUNCATED_JPEG = JPEG.subarray(0, JPEG.length - 2)

function fakeFetch(status: number, body: Buffer, headers: Record<string, string> = {}) {
  return (async () =>
    new Response(new Uint8Array(body), {
      status,
      headers: { "content-length": String(body.length), ...headers },
    })) as unknown as typeof fetch
}

describe("image migration safety", () => {
  const url = "https://backend.sdvedutech.in/api/storage/uploads/a/b.jpg"

  it("only fetches https URLs on allow-listed hosts", () => {
    expect(assertAllowedSourceUrl(url).hostname).toBe("backend.sdvedutech.in")
    expect(() => assertAllowedSourceUrl("http://backend.sdvedutech.in/x.jpg")).toThrow(/https/)
    expect(() => assertAllowedSourceUrl("https://169.254.169.254/latest/meta-data")).toThrow(/not in IMAGE_MIGRATION_ALLOWED_HOSTS/)
    expect(() => assertAllowedSourceUrl("https://minio:9000/bucket/x")).toThrow(/not in/)
    expect(() => assertAllowedSourceUrl("not a url")).toThrow(/Invalid source URL/)
  })

  it("accepts complete images and rejects truncated, empty, oversized or non-image content", () => {
    expect(verifyImageBytes(JPEG, "image/jpeg", JPEG.length)).toMatchObject({ contentType: "image/jpeg", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(() => verifyImageBytes(TRUNCATED_JPEG, "image/jpeg", null)).toThrow(/incomplete/)
    expect(() => verifyImageBytes(JPEG, "image/jpeg", JPEG.length + 10)).toThrow(/Truncated download/)
    expect(() => verifyImageBytes(Buffer.alloc(0), "image/jpeg", 0)).toThrow(/Empty/)
    expect(() => verifyImageBytes(Buffer.from("<html>login</html>"), "image/jpeg", null)).toThrow(/not a JPEG/)
    expect(() => verifyImageBytes(JPEG, "image/jpeg", null, 10)).toThrow(/limit 10/)
  })

  it("sniffs content types from magic bytes", () => {
    expect(sniffFileType(JPEG)).toBe("image/jpeg")
    expect(sniffFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png")
    expect(sniffFileType(Buffer.from("%PDF-1.7"))).toBe("application/pdf")
    expect(sniffFileType(Buffer.from("GIF89a"))).toBe("image/gif")
    expect(sniffFileType(Buffer.from("plain text"))).toBeNull()
    expect(looksComplete(JPEG, "image/jpeg")).toBe(true)
  })

  it("classifies HTTP failures as retryable or permanent", async () => {
    await expect(fetchSourceImage(url, { fetchImpl: fakeFetch(200, JPEG, { "content-type": "image/jpeg" }) })).resolves.toMatchObject({ contentType: "image/jpeg" })
    await expect(fetchSourceImage(url, { fetchImpl: fakeFetch(404, Buffer.from("x")) })).rejects.toMatchObject({ retryable: false })
    await expect(fetchSourceImage(url, { fetchImpl: fakeFetch(503, Buffer.from("x")) })).rejects.toMatchObject({ retryable: true })
    const redirecting = (async () => {
      throw new TypeError("fetch failed: redirect mode is set to error")
    }) as unknown as typeof fetch
    await expect(fetchSourceImage(url, { fetchImpl: redirecting })).rejects.toMatchObject({ retryable: true })
  })

  it("retries transient errors but not permanent ones", async () => {
    let calls = 0
    const flaky = async () => {
      calls++
      if (calls < 3) throw new ImageFetchError("HTTP 503", true)
      return "ok"
    }
    await expect(withRetries(flaky, 3, 1)).resolves.toEqual({ value: "ok", tries: 3 })

    let permanentCalls = 0
    await expect(
      withRetries(async () => {
        permanentCalls++
        throw new ImageFetchError("HTTP 404", false)
      }, 3, 1)
    ).rejects.toThrow("HTTP 404")
    expect(permanentCalls).toBe(1)
  })
})
