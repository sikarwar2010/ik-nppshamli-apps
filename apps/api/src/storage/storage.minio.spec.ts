import { randomUUID } from "node:crypto"

import { Client } from "minio"

import { StorageService } from "./storage.service"

/**
 * Integration test against a real MinIO server. Runs only when
 * MINIO_TEST_ENDPOINT is set, e.g. with the root docker-compose.yml:
 *
 *   MINIO_TEST_ENDPOINT=localhost MINIO_TEST_ACCESS_KEY=shamli-minio-admin \
 *   MINIO_TEST_SECRET_KEY=shamli-minio-dev-password pnpm --filter api test storage.minio
 */
const endpoint = process.env.MINIO_TEST_ENDPOINT?.trim()
const describeMinio = endpoint ? describe : describe.skip

describeMinio("StorageService (MinIO driver)", () => {
  const saved = { ...process.env }
  const bucket = `shamli-test-${randomUUID().slice(0, 8)}`
  let storage: StorageService

  beforeAll(async () => {
    process.env.STORAGE_DRIVER = "minio"
    process.env.MINIO_ENDPOINT = endpoint
    process.env.MINIO_PORT = process.env.MINIO_TEST_PORT ?? "9000"
    process.env.MINIO_USE_SSL = "false"
    process.env.MINIO_ACCESS_KEY = process.env.MINIO_TEST_ACCESS_KEY
    process.env.MINIO_SECRET_KEY = process.env.MINIO_TEST_SECRET_KEY
    process.env.MINIO_BUCKET = bucket
    process.env.STORAGE_SIGNING_SECRET = "test-storage-secret"
    storage = new StorageService()
    await storage.onModuleInit()
  })

  afterAll(async () => {
    const client = new Client({
      endPoint: endpoint!,
      port: Number(process.env.MINIO_PORT),
      useSSL: false,
      accessKey: process.env.MINIO_ACCESS_KEY!,
      secretKey: process.env.MINIO_SECRET_KEY!,
    })
    await client.removeBucket(bucket).catch(() => undefined)
    process.env = saved
  })

  it("creates the private bucket on startup and reports healthy", async () => {
    expect(storage.driverName).toBe("minio")
    expect(storage.bucketName).toBe(bucket)
    expect(await storage.isHealthy()).toBe(true)
  })

  it("uploads, stats, reads, replaces and deletes an image object", async () => {
    const key = "surveys/800645/003/00001-001/front-view.jpg"
    const original = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    await storage.putObject(key, original, "image/jpeg", {
      sha256: "abc",
      "image-type": "Front View",
    })

    const stat = await storage.statObject(key)
    expect(stat).toMatchObject({
      size: original.length,
      contentType: "image/jpeg",
      metadata: { sha256: "abc", "image-type": "Front View" },
    })
    expect(await storage.getObject(key)).toEqual(original)

    const replacement = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9])
    await storage.putObject(key, replacement, "image/jpeg")
    expect(await storage.getObject(key)).toEqual(replacement)

    await storage.deleteObject(key)
    expect(await storage.statObject(key)).toBeNull()
    await expect(storage.openObjectStream(key)).rejects.toMatchObject({
      response: { code: "FILE_NOT_FOUND" },
    })
  })

  it("serves objects only through signed, expiring links", async () => {
    const key = "surveys/signed/check.png"
    await storage.putObject(key, Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png")
    const url = await storage.getSignedUrl(key, 60)
    expect(url.startsWith("/api/v1/files?")).toBe(true)
    expect(url).not.toContain(endpoint!)
    const params = new URLSearchParams(url.split("?")[1])
    expect(() =>
      storage.assertDownloadSignature(
        params.get("key")!,
        params.get("exp")!,
        params.get("sig")!
      )
    ).not.toThrow()

    const expired = String(Math.floor(Date.now() / 1000) - 5)
    expect(() =>
      storage.assertDownloadSignature(key, expired, params.get("sig")!)
    ).toThrow(/expired/i)
    expect(() =>
      storage.assertDownloadSignature(key, params.get("exp")!, "0".repeat(64))
    ).toThrow(/Invalid file link/)
    await storage.deleteObject(key)
  })

  it("rejects traversal keys before touching the bucket", async () => {
    await expect(
      storage.putObject("../escape.jpg", Buffer.from("x"), "image/jpeg")
    ).rejects.toMatchObject({ response: { code: "INVALID_OBJECT_KEY" } })
  })
})
