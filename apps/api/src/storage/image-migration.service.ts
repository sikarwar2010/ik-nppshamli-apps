import { Injectable } from "@nestjs/common"
import type { AttachmentStorageStatus, Prisma } from "@prisma/client"

import { PrismaService } from "../prisma/prisma.service"
import {
  ImageFetchError,
  fetchSourceImage,
  withRetries,
  type FetchedImage,
} from "./image-migration"
import { StorageService } from "./storage.service"

/** Columns the migration reads; select with MIGRATABLE_ATTACHMENT_SELECT. */
export type MigratableAttachment = {
  id: string
  surveyId: string
  objectKey: string
  originalFileName: string
  imageType: string | null
  sourceUrl: string | null
  storageStatus: AttachmentStorageStatus
  checksumSha256: string | null
  size: number
  survey: { surveyId: string }
}

export const MIGRATABLE_ATTACHMENT_SELECT = {
  id: true,
  surveyId: true,
  objectKey: true,
  originalFileName: true,
  imageType: true,
  sourceUrl: true,
  storageStatus: true,
  checksumSha256: true,
  size: true,
  survey: { select: { surveyId: true } },
} satisfies Prisma.SurveyAttachmentSelect

export type MigrationOutcome = "migrated" | "already-present" | "verified" | "failed"

export type MigrationResult = {
  attachmentId: string
  propertyId: string
  imageType: string | null
  imageName: string
  objectKey: string
  outcome: MigrationOutcome
  bytes?: number
  sha256?: string
  tries?: number
  error?: string
}

export type SweepSummary = {
  processed: number
  outcomes: Partial<Record<MigrationOutcome, number>>
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i]!)
      }
    })
  )
  return results
}

export function countOutcomes(results: MigrationResult[]): SweepSummary["outcomes"] {
  return results.reduce<SweepSummary["outcomes"]>(
    (m, r) => ((m[r.outcome] = (m[r.outcome] ?? 0) + 1), m),
    {}
  )
}

/**
 * Copies imported survey images from their legacy source URL into object
 * storage. Shared by the migrate-images-to-minio CLI, the API's background
 * sweep and the per-survey retry endpoint.
 *
 * Idempotent: object keys are fixed on the row, an object already holding the
 * same sha256 is not uploaded again, and a row only becomes AVAILABLE after
 * the stored object is re-read and verified. Failures are kept on the row
 * (FAILED + migrationError) for retry.
 */
@Injectable()
export class ImageMigrationService {
  /** Download + validate with retries; replaced in tests. */
  fetchImage: (url: string) => Promise<{ value: FetchedImage; tries: number }> = (url) =>
    withRetries(() => fetchSourceImage(url))

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async migrateAttachment(a: MigratableAttachment): Promise<MigrationResult> {
    const base = {
      attachmentId: a.id,
      propertyId: a.survey.surveyId,
      imageType: a.imageType,
      imageName: a.originalFileName,
      objectKey: a.objectKey,
    }
    try {
      if (!a.sourceUrl) {
        throw new ImageFetchError("No source URL recorded for this image", false)
      }
      const existing = await this.storage.statObject(a.objectKey)
      if (
        a.storageStatus === "AVAILABLE" &&
        existing &&
        existing.metadata.sha256 === a.checksumSha256 &&
        existing.size === a.size
      ) {
        return { ...base, outcome: "verified", bytes: existing.size, sha256: a.checksumSha256 ?? undefined }
      }

      const { value: image, tries } = await this.fetchImage(a.sourceUrl)
      let outcome: MigrationOutcome = "migrated"
      if (existing && existing.metadata.sha256 === image.sha256 && existing.size === image.body.length) {
        outcome = "already-present"
      } else {
        await this.storage.putObject(a.objectKey, image.body, image.contentType, {
          sha256: image.sha256,
          "property-id": a.survey.surveyId,
          "image-type": a.imageType ?? "",
          "source-name": a.originalFileName,
        })
      }
      // Read back before switching the row to AVAILABLE.
      const stored = await this.storage.statObject(a.objectKey)
      if (!stored || stored.size !== image.body.length || stored.metadata.sha256 !== image.sha256) {
        throw new ImageFetchError("Stored object failed verification after upload", true)
      }
      await this.prisma.surveyAttachment.update({
        where: { id: a.id },
        data: {
          storageStatus: "AVAILABLE",
          bucket: this.storage.bucketName,
          size: image.body.length,
          mimeType: image.contentType,
          checksumSha256: image.sha256,
          migratedAt: new Date(),
          migrationError: null,
          migrationAttempts: { increment: 1 },
        },
      })
      return { ...base, outcome, bytes: image.body.length, sha256: image.sha256, tries }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Never downgrade a verified object because a re-check could not reach
      // the source, nor one a concurrent run has just made AVAILABLE.
      if (a.storageStatus !== "AVAILABLE") {
        await this.prisma.surveyAttachment.updateMany({
          where: { id: a.id, storageStatus: { not: "AVAILABLE" } },
          data: {
            storageStatus: "FAILED",
            migrationError: message.slice(0, 500),
            migrationAttempts: { increment: 1 },
          },
        })
      }
      return { ...base, outcome: "failed", error: message }
    }
  }

  migrateMany(items: MigratableAttachment[], concurrency = 4): Promise<MigrationResult[]> {
    return mapLimit(items, concurrency, (a) => this.migrateAttachment(a))
  }

  /** Migrate (or retry) every imported image of one survey that is not AVAILABLE. */
  async migrateSurveyImages(surveyDbId: string, concurrency = 4): Promise<MigrationResult[]> {
    await this.storage.ensureBucket()
    const items = await this.prisma.surveyAttachment.findMany({
      where: {
        surveyId: surveyDbId,
        sourceUrl: { not: null },
        storageStatus: { in: ["PENDING_MIGRATION", "FAILED"] },
      },
      select: MIGRATABLE_ATTACHMENT_SELECT,
      orderBy: [{ sourceRowNumber: "asc" }, { createdAt: "asc" }],
    })
    return this.migrateMany(items, concurrency)
  }

  /**
   * Work through PENDING_MIGRATION rows in id order. Each row ends AVAILABLE
   * or FAILED, and the id cursor guarantees termination even if a status
   * update is lost. FAILED rows are left for an explicit retry.
   */
  async sweepPending(options: {
    batchSize?: number
    concurrency?: number
    shouldContinue?: () => Promise<boolean>
  } = {}): Promise<SweepSummary> {
    const batchSize = options.batchSize ?? 25
    const concurrency = options.concurrency ?? 4
    await this.storage.ensureBucket()
    const results: MigrationResult[] = []
    let cursor: string | undefined
    for (;;) {
      const batch = await this.prisma.surveyAttachment.findMany({
        where: {
          storageStatus: "PENDING_MIGRATION",
          sourceUrl: { not: null },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: MIGRATABLE_ATTACHMENT_SELECT,
        orderBy: { id: "asc" },
        take: batchSize,
      })
      if (batch.length === 0) break
      results.push(...(await this.migrateMany(batch, concurrency)))
      cursor = batch[batch.length - 1]!.id
      if (batch.length < batchSize) break
      if (options.shouldContinue && !(await options.shouldContinue())) break
    }
    return { processed: results.length, outcomes: countOutcomes(results) }
  }
}
