import { collectStorageEnvErrors, loadStorageConfig } from "./storage-config"

const minioEnv: NodeJS.ProcessEnv = {
  STORAGE_DRIVER: "minio",
  MINIO_ENDPOINT: "minio",
  MINIO_PORT: "9000",
  MINIO_ACCESS_KEY: "shamli-app",
  MINIO_SECRET_KEY: "a-strong-secret-value",
  MINIO_BUCKET: "shamli-survey-images",
}

describe("storage config", () => {
  it("defaults to local disk storage", () => {
    expect(loadStorageConfig({ STORAGE_DIR: "/app/uploads" })).toEqual({
      driver: "local",
      storageDir: "/app/uploads",
    })
    expect(collectStorageEnvErrors({})).toEqual([])
  })

  it("parses a complete MinIO configuration", () => {
    const config = loadStorageConfig(minioEnv)
    expect(config.driver).toBe("minio")
    if (config.driver !== "minio") throw new Error("expected minio")
    expect(config.minio).toMatchObject({
      endPoint: "minio",
      port: 9000,
      useSSL: false,
      bucket: "shamli-survey-images",
      region: "us-east-1",
    })
  })

  it("defaults the port to 443 when TLS is enabled", () => {
    const config = loadStorageConfig({
      ...minioEnv,
      MINIO_PORT: "",
      MINIO_USE_SSL: "true",
    })
    if (config.driver !== "minio") throw new Error("expected minio")
    expect(config.minio).toMatchObject({ port: 443, useSSL: true })
  })

  it("lists every missing MinIO variable", () => {
    const errors = collectStorageEnvErrors({ STORAGE_DRIVER: "minio" })
    expect(errors.join("\n")).toMatch(/MINIO_ENDPOINT/)
    expect(errors.join("\n")).toMatch(/MINIO_ACCESS_KEY/)
    expect(errors.join("\n")).toMatch(/MINIO_SECRET_KEY/)
    expect(errors.join("\n")).toMatch(/MINIO_BUCKET/)
    expect(() => loadStorageConfig({ STORAGE_DRIVER: "minio" })).toThrow(
      /Invalid storage configuration/
    )
  })

  it("rejects endpoints with a scheme, bad buckets and unknown drivers", () => {
    expect(
      collectStorageEnvErrors({ ...minioEnv, MINIO_ENDPOINT: "http://minio:9000" })
    ).toEqual([expect.stringMatching(/host name only/)])
    expect(
      collectStorageEnvErrors({ ...minioEnv, MINIO_BUCKET: "Bad_Bucket" })
    ).toEqual([expect.stringMatching(/valid S3 bucket name/)])
    expect(collectStorageEnvErrors({ STORAGE_DRIVER: "s3" })).toEqual([
      expect.stringMatching(/STORAGE_DRIVER/),
    ])
  })

  it("rejects development MinIO secrets in production", () => {
    expect(
      collectStorageEnvErrors({
        ...minioEnv,
        NODE_ENV: "production",
        MINIO_SECRET_KEY: "shamli-minio-dev-password",
      })
    ).toEqual([expect.stringMatching(/development default/)])
    expect(
      collectStorageEnvErrors({
        ...minioEnv,
        NODE_ENV: "production",
        MINIO_SECRET_KEY: "CHANGE_ME_strong_api_secret_key",
      })
    ).toEqual([expect.stringMatching(/placeholder/)])
  })
})
