import { describeStorageError, StorageService } from "./storage.service"

describe("describeStorageError", () => {
  it("points AccessDenied at API user provisioning", () => {
    const err = Object.assign(
      new Error("Valid and authorized credentials required"),
      { code: "AccessDenied" }
    )
    expect(describeStorageError(err)).toBe(
      "Valid and authorized credentials required (AccessDenied: check that MINIO_ACCESS_KEY/MINIO_SECRET_KEY match a provisioned storage user with access to MINIO_BUCKET — see the minio-init service)"
    )
  })

  it("passes other errors through unchanged", () => {
    expect(describeStorageError(new Error("connect ECONNREFUSED"))).toBe(
      "connect ECONNREFUSED"
    )
    expect(describeStorageError("boom")).toBe("boom")
  })
})

describe("StorageService", () => {
  const previousDir = process.env.STORAGE_DIR
  const previousSecret = process.env.STORAGE_SIGNING_SECRET

  beforeEach(() => {
    process.env.STORAGE_DIR = "tmp/storage-test"
    process.env.STORAGE_SIGNING_SECRET = "test-storage-secret"
  })

  afterEach(() => {
    if (previousDir === undefined) delete process.env.STORAGE_DIR
    else process.env.STORAGE_DIR = previousDir
    if (previousSecret === undefined) delete process.env.STORAGE_SIGNING_SECRET
    else process.env.STORAGE_SIGNING_SECRET = previousSecret
  })

  it("rejects path traversal in object keys", () => {
    const storage = new StorageService()
    storage.onModuleInit()
    expect(() => storage.resolveObjectPath("../secret.txt")).toThrow()
  })

  it("issues and verifies a download signature", async () => {
    const storage = new StorageService()
    storage.onModuleInit()
    await storage.putObject(
      "imports/sample.txt",
      Buffer.from("ok"),
      "text/plain"
    )
    const url = await storage.getSignedUrl("imports/sample.txt", 60)
    const params = new URLSearchParams(url.split("?")[1])
    expect(() =>
      storage.assertDownloadSignature(
        params.get("key") ?? "",
        params.get("exp") ?? "",
        params.get("sig") ?? ""
      )
    ).not.toThrow()
  })
})
