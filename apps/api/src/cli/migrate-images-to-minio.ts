/**
 * Migrate imported survey images from their legacy URLs into object storage.
 *
 *   node dist/cli/migrate-images-to-minio.js [--ward 3] [--retry-failed]
 *       [--verify-available] [--limit N] [--concurrency 4] [--dry-run] [--out tmp/reports]
 *
 * Idempotent: keys are stable (property-images/<ulb>/ward-<n>/<property id>/…),
 * an object already present with the same sha256 is not uploaded again, and
 * rows are only marked AVAILABLE after the stored object is re-read and
 * verified. Failures are recorded on the row (migrationError / attempts) and
 * retried with --retry-failed.
 */
import { AttachmentStorageStatus, type Prisma } from "@prisma/client"
import path from "node:path"

import { PrismaService } from "../prisma/prisma.service"
import {
  ImageFetchError,
  fetchSourceImage,
  withRetries,
} from "../storage/image-migration"
import { StorageService } from "../storage/storage.service"
import {
  cliArgs,
  mdTable,
  runCli,
  timestamp,
  withAppContext,
  writeReport,
} from "./cli-support"

const USAGE = `Usage: node dist/cli/migrate-images-to-minio.js [--ward <n>] [--retry-failed]
       [--verify-available] [--limit <n>] [--concurrency <n>] [--dry-run] [--out <dir>]`

type Outcome = "migrated" | "already-present" | "verified" | "failed" | "would-migrate"

type ItemResult = {
  attachmentId: string
  propertyId: string
  imageType: string | null
  imageName: string
  objectKey: string
  outcome: Outcome
  bytes?: number
  sha256?: string
  tries?: number
  error?: string
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

runCli("migrate-images-to-minio", async () => {
  const args = cliArgs(
    {
      ward: { type: "string" },
      "retry-failed": { type: "boolean", default: false },
      "verify-available": { type: "boolean", default: false },
      limit: { type: "string" },
      concurrency: { type: "string", default: "4" },
      "dry-run": { type: "boolean", default: false },
      out: { type: "string", default: "tmp/reports" },
      help: { type: "boolean", default: false },
    },
    USAGE
  )

  return withAppContext(async (app) => {
    const prisma = app.get(PrismaService)
    const storage = app.get(StorageService)
    if (storage.driverName !== "minio" && !args["dry-run"]) {
      console.error("STORAGE_DRIVER is not minio; refusing to migrate into local disk storage.")
      return 2
    }
    await storage.ensureBucket()

    const statuses: AttachmentStorageStatus[] = [AttachmentStorageStatus.PENDING_MIGRATION]
    if (args["retry-failed"]) statuses.push(AttachmentStorageStatus.FAILED)
    if (args["verify-available"]) statuses.push(AttachmentStorageStatus.AVAILABLE)
    const where: Prisma.SurveyAttachmentWhereInput = {
      sourceUrl: { not: null },
      storageStatus: { in: statuses },
      ...(args.ward ? { survey: { ward: { number: Number(args.ward) } } } : {}),
    }
    const items = await prisma.surveyAttachment.findMany({
      where,
      include: { survey: { select: { surveyId: true } } },
      orderBy: [{ sourceRowNumber: "asc" }, { createdAt: "asc" }],
      ...(args.limit ? { take: Number(args.limit) } : {}),
    })
    console.log(`Selected ${items.length} image(s) [${statuses.join(", ")}] → bucket "${storage.bucketName}"`)

    const results = await mapLimit(items, Number(args.concurrency) || 4, async (a): Promise<ItemResult> => {
      const base = {
        attachmentId: a.id,
        propertyId: a.survey.surveyId,
        imageType: a.imageType,
        imageName: a.originalFileName,
        objectKey: a.objectKey,
      }
      if (args["dry-run"]) return { ...base, outcome: "would-migrate" }
      try {
        const existing = await storage.statObject(a.objectKey)
        if (a.storageStatus === "AVAILABLE" && existing && existing.metadata.sha256 === a.checksumSha256 && existing.size === a.size) {
          return { ...base, outcome: "verified", bytes: existing.size, sha256: a.checksumSha256 ?? undefined }
        }

        const { value: image, tries } = await withRetries(() => fetchSourceImage(a.sourceUrl!))
        let outcome: Outcome = "migrated"
        if (existing && existing.metadata.sha256 === image.sha256 && existing.size === image.body.length) {
          outcome = "already-present"
        } else {
          await storage.putObject(a.objectKey, image.body, image.contentType, {
            sha256: image.sha256,
            "property-id": a.survey.surveyId,
            "image-type": a.imageType ?? "",
            "source-name": a.originalFileName,
          })
        }
        // Read back before switching the row to AVAILABLE.
        const stored = await storage.statObject(a.objectKey)
        if (!stored || stored.size !== image.body.length || stored.metadata.sha256 !== image.sha256) {
          throw new ImageFetchError("Stored object failed verification after upload", true)
        }
        await prisma.surveyAttachment.update({
          where: { id: a.id },
          data: {
            storageStatus: "AVAILABLE",
            bucket: storage.bucketName,
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
        // Never downgrade a verified object because a re-check could not reach the source.
        if (a.storageStatus !== "AVAILABLE") {
          await prisma.surveyAttachment.update({
            where: { id: a.id },
            data: {
              storageStatus: "FAILED",
              migrationError: message.slice(0, 500),
              migrationAttempts: { increment: 1 },
            },
          })
        }
        return { ...base, outcome: "failed", error: message }
      }
    })

    const counts = results.reduce<Record<string, number>>((m, r) => ((m[r.outcome] = (m[r.outcome] ?? 0) + 1), m), {})
    const remaining = await prisma.surveyAttachment.groupBy({
      by: ["storageStatus"],
      where: { sourceUrl: { not: null }, ...(args.ward ? { survey: { ward: { number: Number(args.ward) } } } : {}) },
      _count: { _all: true },
    })
    const totals = Object.fromEntries(remaining.map((r) => [r.storageStatus, r._count._all]))
    const bytes = results.reduce((s, r) => s + (r.bytes ?? 0), 0)
    const failed = results.filter((r) => r.outcome === "failed")
    const report = {
      generatedAt: new Date().toISOString(),
      bucket: storage.bucketName,
      ward: args.ward ?? "all",
      selected: items.length,
      outcomes: counts,
      bytesTransferredOrVerified: bytes,
      storageStatusAfterRun: totals,
      failures: failed,
      items: results,
    }
    const md = [
      "# Image migration to object storage",
      "",
      `Generated ${report.generatedAt} · bucket \`${report.bucket}\` · ward ${report.ward}${args["dry-run"] ? " · **dry run**" : ""}`,
      "",
      mdTable(["Outcome", "Count"], Object.entries(counts)),
      "",
      "Storage status after run:",
      "",
      mdTable(["Status", "Images"], Object.entries(totals)),
      "",
      `Total bytes: ${bytes}`,
      "",
      "## Failures (retry with `--retry-failed`)",
      failed.length ? mdTable(["Property Id", "Image Type", "Image Name", "Error"], failed.map((f) => [f.propertyId, f.imageType, f.imageName, f.error])) : "None.",
      "",
      "## Items",
      mdTable(["Property Id", "Image Type", "Object key", "Outcome", "Bytes", "SHA-256", "Tries"], results.map((r) => [r.propertyId, r.imageType, r.objectKey, r.outcome, r.bytes ?? "", r.sha256?.slice(0, 16) ?? "", r.tries ?? ""])),
      "",
    ].join("\n")
    const out = await writeReport(path.resolve(String(args.out)), `image-migration-${timestamp()}`, report, md)
    console.log(JSON.stringify({ selected: items.length, outcomes: counts, storageStatusAfterRun: totals, bytes }, null, 2))
    console.log(`Migration report: ${out}`)
    return failed.length > 0 ? 1 : 0
  })
})
