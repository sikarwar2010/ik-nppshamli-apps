import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common"
import { createHmac, timingSafeEqual } from "node:crypto"
import path from "node:path"
import type { Readable } from "node:stream"

import type { AuthUser } from "../auth/auth.decorators"
import {
  assertFileAccess,
  parseSurveyIdFromObjectKey,
  type FileResource,
  type SurveyResource,
} from "../auth/resource-access"
import { loadStorageConfig, type StorageDriverName } from "./storage-config"
import {
  LocalDiskDriver,
  MinioDriver,
  type ObjectMetadata,
  type ObjectStat,
  type ObjectStorageDriver,
} from "./storage-drivers"

const MIME_BY_EXT: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private root = path.resolve(process.env.STORAGE_DIR ?? "uploads")
  private driver: ObjectStorageDriver = this.createDriver()
  private ready: Promise<void> | null = null

  async onModuleInit() {
    this.driver = this.createDriver()
    this.ready = null
    if (this.driver.name === "minio") {
      this.logger.log(`MinIO object storage, bucket "${this.driver.bucket}"`)
    } else {
      this.logger.log(`Local file storage at ${this.root}`)
    }
    try {
      await this.ensureBucket()
    } catch (err) {
      // Keep the API up; /api/v1/health/ready reports storage=false and the
      // next upload retries bucket initialization.
      this.logger.error(`Storage not ready: ${describeStorageError(err)}`)
    }
  }

  get driverName(): StorageDriverName {
    return this.driver.name
  }

  /** Bucket recorded on SurveyAttachment rows (`local` for disk storage). */
  get bucketName(): string {
    return this.driver.bucket
  }

  async ensureBucket() {
    if (!this.ready) {
      this.ready = this.driver.ensureReady().catch((err: unknown) => {
        this.ready = null
        throw err
      })
    }
    await this.ready
  }

  async putObject(
    objectKey: string,
    buffer: Buffer,
    mimeType?: string,
    metadata?: ObjectMetadata
  ): Promise<string> {
    this.assertValidObjectKey(objectKey)
    await this.ensureBucket()
    await this.driver.put(
      objectKey,
      buffer,
      mimeType || this.guessMime(objectKey),
      metadata
    )
    return objectKey
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const stream = await this.openObjectStream(objectKey)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  async openObjectStream(objectKey: string): Promise<Readable> {
    this.assertValidObjectKey(objectKey)
    const stream = await this.driver.openStream(objectKey)
    if (!stream) {
      throw new NotFoundException({
        code: "FILE_NOT_FOUND",
        message: "File not found",
      })
    }
    return stream
  }

  /** Object size / content type / metadata, or null when missing. */
  async statObject(objectKey: string): Promise<ObjectStat | null> {
    this.assertValidObjectKey(objectKey)
    return this.driver.stat(objectKey)
  }

  async deleteObject(objectKey: string): Promise<void> {
    this.assertValidObjectKey(objectKey)
    await this.driver.delete(objectKey)
  }

  async isHealthy(): Promise<boolean> {
    return this.driver.ping()
  }

  guessMime(objectKey: string): string {
    return (
      MIME_BY_EXT[path.extname(objectKey).toLowerCase()] ??
      "application/octet-stream"
    )
  }

  async getSignedUrl(objectKey: string, expirySeconds = 300): Promise<string> {
    this.assertValidObjectKey(objectKey)
    const exp = Math.floor(Date.now() / 1000) + expirySeconds
    const sig = this.sign(objectKey, exp)
    const params = new URLSearchParams({
      key: objectKey,
      exp: String(exp),
      sig,
    })
    return `/api/v1/files?${params.toString()}`
  }

  async getSignedUrlForUser(
    user: AuthUser,
    objectKey: string,
    context: {
      surveyId?: string | null
      uploadedById?: string | null
      createdById?: string | null
      survey?: SurveyResource | null
    } = {},
    expirySeconds = 300
  ): Promise<string> {
    const file: FileResource = {
      objectKey,
      surveyId: context.surveyId ?? parseSurveyIdFromObjectKey(objectKey),
      uploadedById: context.uploadedById,
      createdById: context.createdById,
    }
    assertFileAccess(user, file, "read", context.survey)
    return this.getSignedUrl(objectKey, expirySeconds)
  }

  assertDownloadSignature(objectKey: string, expRaw: string, sig: string) {
    const exp = Number(expRaw)
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException({
        code: "FILE_URL_EXPIRED",
        message: "File link expired",
      })
    }
    const expected = this.sign(objectKey, exp)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException({
        code: "FILE_URL_INVALID",
        message: "Invalid file link",
      })
    }
    this.assertValidObjectKey(objectKey)
  }

  private sign(objectKey: string, exp: number): string {
    return createHmac("sha256", this.signingSecret())
      .update(`${objectKey}.${exp}`)
      .digest("hex")
  }

  private signingSecret(): string {
    return (
      process.env.STORAGE_SIGNING_SECRET?.trim() ||
      process.env.SESSION_SECRET?.trim() ||
      process.env.BETTER_AUTH_SECRET?.trim() ||
      "dev-storage-signing-secret"
    )
  }

  /** Rejects empty keys, traversal, and absolute paths for every driver. */
  assertValidObjectKey(objectKey: string): string {
    const normalized = objectKey.replaceAll("\\", "/").replace(/^\/+/, "")
    if (
      !normalized ||
      normalized.includes("..") ||
      normalized.length > 900 ||
      [...normalized].some((ch) => ch.charCodeAt(0) < 0x20)
    ) {
      throw new BadRequestException({
        code: "INVALID_OBJECT_KEY",
        message: "Invalid object key",
      })
    }
    return normalized
  }

  resolveObjectPath(objectKey: string): string {
    const normalized = this.assertValidObjectKey(objectKey)
    const full = path.resolve(this.root, normalized)
    const rootWithSep = this.root.endsWith(path.sep)
      ? this.root
      : `${this.root}${path.sep}`
    if (full !== this.root && !full.startsWith(rootWithSep)) {
      throw new BadRequestException({
        code: "INVALID_OBJECT_KEY",
        message: "Invalid object key",
      })
    }
    return full
  }

  private createDriver(): ObjectStorageDriver {
    const config = loadStorageConfig()
    this.root = path.resolve(config.storageDir)
    if (config.driver === "minio") return new MinioDriver(config.minio)
    return new LocalDiskDriver(this.root, (key) => this.resolveObjectPath(key))
  }
}

/** Log-safe error text; never includes credentials. */
export function describeStorageError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  // minio-js reports any 403 on bucket HEAD this way: the key is unknown to
  // the server, the secret is wrong, or the user lacks a bucket policy.
  if ((err as { code?: string }).code === "AccessDenied") {
    return `${err.message} (AccessDenied: check that MINIO_ACCESS_KEY/MINIO_SECRET_KEY match a provisioned storage user with access to MINIO_BUCKET — see the minio-init service)`
  }
  return err.message
}
