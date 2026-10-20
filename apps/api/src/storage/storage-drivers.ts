import { createReadStream } from "node:fs"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Readable } from "node:stream"

import { Client as MinioClient } from "minio"

import type { MinioConfig } from "./storage-config"

export type ObjectMetadata = Record<string, string>

export type ObjectStat = {
  size: number
  contentType: string | null
  metadata: ObjectMetadata
}

/** Minimal object-store contract shared by local disk and MinIO. */
export interface ObjectStorageDriver {
  readonly name: "local" | "minio"
  readonly bucket: string
  ensureReady(): Promise<void>
  put(
    key: string,
    body: Buffer,
    contentType: string,
    metadata?: ObjectMetadata
  ): Promise<void>
  /** Returns null when the object does not exist. */
  stat(key: string): Promise<ObjectStat | null>
  /** Returns null when the object does not exist. */
  openStream(key: string): Promise<Readable | null>
  delete(key: string): Promise<void>
  ping(): Promise<boolean>
}

/**
 * Local disk driver. Metadata is kept in a sidecar `<key>.meta.json` so the
 * contract (content type, checksum, source) matches MinIO.
 */
export class LocalDiskDriver implements ObjectStorageDriver {
  readonly name = "local" as const
  readonly bucket = "local"

  constructor(
    private readonly root: string,
    private readonly resolvePath: (key: string) => string
  ) {}

  async ensureReady() {
    await mkdir(this.root, { recursive: true })
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
    metadata: ObjectMetadata = {}
  ) {
    const filePath = this.resolvePath(key)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, body)
    await writeFile(
      `${filePath}.meta.json`,
      JSON.stringify({ contentType, metadata })
    )
  }

  async stat(key: string): Promise<ObjectStat | null> {
    const filePath = this.resolvePath(key)
    try {
      const info = await stat(filePath)
      if (!info.isFile()) return null
      let contentType: string | null = null
      let metadata: ObjectMetadata = {}
      try {
        const sidecar = JSON.parse(
          await readFile(`${filePath}.meta.json`, "utf8")
        ) as { contentType?: string; metadata?: ObjectMetadata }
        contentType = sidecar.contentType ?? null
        metadata = sidecar.metadata ?? {}
      } catch {
        // Objects written before sidecars existed have no metadata.
      }
      return { size: info.size, contentType, metadata }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
      throw err
    }
  }

  async openStream(key: string): Promise<Readable | null> {
    const exists = await this.stat(key)
    if (!exists) return null
    return createReadStream(this.resolvePath(key))
  }

  async delete(key: string) {
    const filePath = this.resolvePath(key)
    await rm(filePath, { force: true })
    await rm(`${filePath}.meta.json`, { force: true })
  }

  async ping() {
    try {
      await mkdir(this.root, { recursive: true })
      return true
    } catch {
      return false
    }
  }
}

const NOT_FOUND_CODES = new Set(["NoSuchKey", "NotFound", "NoSuchObject"])

function isNotFound(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  return code != null && NOT_FOUND_CODES.has(code)
}

/** User metadata keys are stored lower-cased with an `x-amz-meta-` prefix. */
function readUserMetadata(meta: Record<string, unknown>): ObjectMetadata {
  const out: ObjectMetadata = {}
  for (const [k, v] of Object.entries(meta ?? {})) {
    if (k.toLowerCase() === "content-type") continue
    out[k.toLowerCase().replace(/^x-amz-meta-/, "")] = String(v)
  }
  return out
}

/** Private MinIO / S3 bucket driver. Bucket is created on startup if missing. */
export class MinioDriver implements ObjectStorageDriver {
  readonly name = "minio" as const
  readonly bucket: string
  private readonly client: MinioClient
  private readonly region: string

  constructor(config: MinioConfig, client?: MinioClient) {
    this.bucket = config.bucket
    this.region = config.region
    this.client =
      client ??
      new MinioClient({
        endPoint: config.endPoint,
        port: config.port,
        useSSL: config.useSSL,
        accessKey: config.accessKey,
        secretKey: config.secretKey,
        region: config.region,
      })
  }

  async ensureReady() {
    const exists = await this.client.bucketExists(this.bucket)
    if (!exists) {
      // No bucket policy is applied: the bucket stays private and objects are
      // only reachable through the API's signed /api/v1/files endpoint.
      await this.client.makeBucket(this.bucket, this.region)
    }
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
    metadata: ObjectMetadata = {}
  ) {
    await this.client.putObject(this.bucket, key, body, body.length, {
      "Content-Type": contentType,
      ...Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [`X-Amz-Meta-${k}`, v])
      ),
    })
  }

  async stat(key: string): Promise<ObjectStat | null> {
    try {
      const info = await this.client.statObject(this.bucket, key)
      const meta = (info.metaData ?? {}) as Record<string, unknown>
      const contentType =
        (meta["content-type"] as string | undefined) ??
        (meta["Content-Type"] as string | undefined) ??
        null
      return { size: info.size, contentType, metadata: readUserMetadata(meta) }
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  async openStream(key: string): Promise<Readable | null> {
    try {
      return await this.client.getObject(this.bucket, key)
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  async delete(key: string) {
    await this.client.removeObject(this.bucket, key)
  }

  async ping() {
    try {
      return await this.client.bucketExists(this.bucket)
    } catch {
      return false
    }
  }
}
