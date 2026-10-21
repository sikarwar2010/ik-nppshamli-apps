import { createHash } from "node:crypto"

import { ImageFetchError, type FetchedImage } from "./image-migration"
import {
  ImageMigrationService,
  type MigratableAttachment,
} from "./image-migration.service"
import type { ObjectStat } from "./storage-drivers"

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.alloc(32, 7),
  Buffer.from([0xff, 0xd9]),
])
const SHA = createHash("sha256").update(JPEG).digest("hex")
const IMAGE: FetchedImage = {
  body: JPEG,
  contentType: "image/jpeg",
  sha256: SHA,
  declaredContentType: "image/jpeg",
}

const KEY =
  "property-images/800645/ward-003/800645-003-00031-006-R/front-view--b83c3c6a-5832-4f72-a9a3-c2d106103894.jpg"

function attachment(overrides: Partial<MigratableAttachment> = {}): MigratableAttachment {
  return {
    id: "att-front",
    surveyId: "survey-db-1",
    objectKey: KEY,
    originalFileName: "b83c3c6a-5832-4f72-a9a3-c2d106103894.jpg",
    imageType: "Front View",
    sourceUrl: "https://backend.sdvedutech.in/api/storage/uploads/x/b83c3c6a.jpg",
    storageStatus: "PENDING_MIGRATION",
    checksumSha256: null,
    size: 0,
    survey: { surveyId: "800645-003-00031-006-R" },
    ...overrides,
  }
}

/** In-memory object store with the StorageService surface the migration uses. */
function fakeStorage() {
  const objects = new Map<string, ObjectStat>()
  return {
    objects,
    bucketName: "shamli-survey-images",
    driverName: "minio",
    ensureBucket: jest.fn(async () => undefined),
    statObject: jest.fn(async (key: string) => objects.get(key) ?? null),
    putObject: jest.fn(
      async (key: string, body: Buffer, contentType: string, metadata: Record<string, string> = {}) => {
        objects.set(key, { size: body.length, contentType, metadata })
        return key
      }
    ),
  }
}

function fakePrisma(rows: MigratableAttachment[] = []) {
  return {
    surveyAttachment: {
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(
        async (args: { where: { id?: { gt: string } }; take: number }) => {
          const after = args.where.id?.gt
          return rows
            .filter((r) => !after || r.id > after)
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, args.take)
        }
      ),
    },
  }
}

function setup(rows: MigratableAttachment[] = []) {
  const storage = fakeStorage()
  const prisma = fakePrisma(rows)
  const service = new ImageMigrationService(prisma as never, storage as never)
  service.fetchImage = jest.fn(async () => ({ value: IMAGE, tries: 1 }))
  return { service, storage, prisma }
}

describe("ImageMigrationService", () => {
  it("uploads, verifies the stored object, then marks the row AVAILABLE", async () => {
    const { service, storage, prisma } = setup()
    const result = await service.migrateAttachment(attachment())

    expect(result.outcome).toBe("migrated")
    expect(storage.putObject).toHaveBeenCalledWith(KEY, JPEG, "image/jpeg", {
      sha256: SHA,
      "property-id": "800645-003-00031-006-R",
      "image-type": "Front View",
      "source-name": "b83c3c6a-5832-4f72-a9a3-c2d106103894.jpg",
    })
    expect(prisma.surveyAttachment.update).toHaveBeenCalledWith({
      where: { id: "att-front" },
      data: expect.objectContaining({
        storageStatus: "AVAILABLE",
        bucket: "shamli-survey-images",
        size: JPEG.length,
        mimeType: "image/jpeg",
        checksumSha256: SHA,
        migrationError: null,
      }),
    })
  })

  it("never marks AVAILABLE when the stored object fails verification", async () => {
    const { service, storage, prisma } = setup()
    storage.putObject.mockImplementationOnce(async (key: string) => {
      storage.objects.set(key, { size: 1, contentType: "image/jpeg", metadata: {} })
      return key
    })
    const result = await service.migrateAttachment(attachment())

    expect(result.outcome).toBe("failed")
    expect(result.error).toMatch(/failed verification/)
    expect(prisma.surveyAttachment.update).not.toHaveBeenCalled()
    expect(prisma.surveyAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: "att-front", storageStatus: { not: "AVAILABLE" } },
      data: expect.objectContaining({ storageStatus: "FAILED" }),
    })
  })

  it("records an unreachable source as FAILED and succeeds on retry", async () => {
    const { service, prisma } = setup()
    ;(service.fetchImage as jest.Mock).mockRejectedValueOnce(
      new ImageFetchError("HTTP 404 from source", false)
    )
    const first = await service.migrateAttachment(attachment())
    expect(first).toMatchObject({ outcome: "failed", error: "HTTP 404 from source" })
    expect(prisma.surveyAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: "att-front", storageStatus: { not: "AVAILABLE" } },
      data: {
        storageStatus: "FAILED",
        migrationError: "HTTP 404 from source",
        migrationAttempts: { increment: 1 },
      },
    })

    const retry = await service.migrateAttachment(attachment({ storageStatus: "FAILED" }))
    expect(retry.outcome).toBe("migrated")
  })

  it("does not upload again when the object already holds the same bytes", async () => {
    const { service, storage } = setup()
    storage.objects.set(KEY, { size: JPEG.length, contentType: "image/jpeg", metadata: { sha256: SHA } })

    const result = await service.migrateAttachment(attachment())
    expect(result.outcome).toBe("already-present")
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it("verifies AVAILABLE rows without re-downloading", async () => {
    const { service, storage, prisma } = setup()
    storage.objects.set(KEY, { size: JPEG.length, contentType: "image/jpeg", metadata: { sha256: SHA } })

    const result = await service.migrateAttachment(
      attachment({ storageStatus: "AVAILABLE", checksumSha256: SHA, size: JPEG.length })
    )
    expect(result.outcome).toBe("verified")
    expect(service.fetchImage).not.toHaveBeenCalled()
    expect(prisma.surveyAttachment.update).not.toHaveBeenCalled()
  })

  it("never downgrades a verified row when a re-check cannot reach the source", async () => {
    const { service, prisma } = setup()
    ;(service.fetchImage as jest.Mock).mockRejectedValueOnce(new Error("Network error"))

    const result = await service.migrateAttachment(
      attachment({ storageStatus: "AVAILABLE", checksumSha256: SHA, size: JPEG.length })
    )
    expect(result.outcome).toBe("failed")
    expect(prisma.surveyAttachment.updateMany).not.toHaveBeenCalled()
  })

  it("keeps each image on its own property key", async () => {
    const { service, storage } = setup()
    const side = attachment({
      id: "att-side",
      objectKey: KEY.replace("front-view--b83c3c6a-5832-4f72-a9a3-c2d106103894", "side-view--94015850-2372-4639-aa90-f5bebf590c97"),
      imageType: "Side View",
      originalFileName: "94015850-2372-4639-aa90-f5bebf590c97.jpg",
    })
    await service.migrateMany([attachment(), side], 2)

    expect([...storage.objects.keys()].sort()).toEqual([side.objectKey, KEY].sort())
    for (const key of storage.objects.keys()) {
      expect(key).toContain("/800645-003-00031-006-R/")
    }
  })

  it("sweeps pending rows in id order and stops when the queue is drained", async () => {
    const rows = ["a", "b", "c"].map((id) => attachment({ id, objectKey: `${KEY}-${id}` }))
    const { service, prisma } = setup(rows)

    const summary = await service.sweepPending({ batchSize: 2, concurrency: 2 })
    expect(summary).toEqual({ processed: 3, outcomes: { migrated: 3 } })
    expect(prisma.surveyAttachment.findMany).toHaveBeenCalledTimes(2)
    expect(prisma.surveyAttachment.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          storageStatus: "PENDING_MIGRATION",
          sourceUrl: { not: null },
          id: { gt: "b" },
        },
        take: 2,
      })
    )
  })

  it("stops a sweep when asked to (lock lost / shutdown)", async () => {
    const rows = ["a", "b", "c"].map((id) => attachment({ id, objectKey: `${KEY}-${id}` }))
    const { service } = setup(rows)

    const summary = await service.sweepPending({
      batchSize: 1,
      concurrency: 1,
      shouldContinue: async () => false,
    })
    expect(summary.processed).toBe(1)
  })
})
