import {
  BadRequestException,
  ConflictException,
} from "@nestjs/common"
import { Test, TestingModule } from "@nestjs/testing"

import { AuditService } from "../audit/audit.service"
import { PrismaService } from "../prisma/prisma.service"
import { ImageMigrationService } from "../storage/image-migration.service"
import { StorageService } from "../storage/storage.service"
import { SurveysService } from "./surveys.service"

const ward = { id: "ward-1", number: 1, name: "Ward 1", code: "001" }

const baseSurvey = {
  id: "survey-cuid-1",
  surveyId: "249044-001-000131-001-R",
  wardId: ward.id,
  parcelNo: "000131",
  propertyNo: "001",
  ownerName: "Kanheya",
  ownerFatherName: "Kakkali",
  mobile: null,
  floorsRaw: null,
  plotAreaSqFt: null,
  totalBuiltUpAreaSqFt: null,
  deletedAt: null,
  status: "ACTIVE",
  dataQualityStatus: "NEEDS_REVIEW",
  ward,
  floors: [],
  attachments: [],
  createdBy: null,
  updatedBy: null,
}

describe("SurveysService", () => {
  let service: SurveysService
  let prisma: {
    survey: {
      findUnique: jest.Mock
      findFirst: jest.Mock
      update: jest.Mock
      create: jest.Mock
    }
    ward: { findUnique: jest.Mock }
    surveyFloor: { deleteMany: jest.Mock }
    $transaction: jest.Mock
  }
  let audit: { log: jest.Mock }
  let storage: { getSignedUrlForUser: jest.Mock }
  let imageMigration: { migrateSurveyImages: jest.Mock }

  const afterEachRestore: Array<() => void> = []
  afterEach(() => {
    while (afterEachRestore.length) afterEachRestore.pop()?.()
  })

  beforeEach(async () => {
    prisma = {
      survey: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      ward: { findUnique: jest.fn().mockResolvedValue(ward) },
      surveyFloor: { deleteMany: jest.fn() },
      $transaction: jest.fn(),
    }
    audit = { log: jest.fn() }
    storage = {
      getSignedUrlForUser: jest.fn(
        async (_user: unknown, key: string) => `/api/v1/files?key=${encodeURIComponent(key)}&exp=1&sig=s`
      ),
    }
    imageMigration = { migrateSurveyImages: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SurveysService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: StorageService, useValue: storage },
        { provide: ImageMigrationService, useValue: imageMigration },
      ],
    }).compile()

    service = module.get(SurveysService)
  })

  function mockFindOne() {
    prisma.survey.findFirst.mockResolvedValue(baseSurvey)
  }

  function mockSuccessfulUpdate(updated: Record<string, unknown>) {
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)
    )
    prisma.survey.update.mockResolvedValue({
      ...baseSurvey,
      ...updated,
    })
  }

  const user = {
    id: "user-1",
    email: "a@b.com",
    name: "Admin",
    status: "ACTIVE",
    roles: ["SUPER_ADMIN"],
    permissions: ["survey:read", "survey:create", "survey:update", "survey:delete"],
  }

  it("updates owner only without changing survey id (Test 1)", async () => {
    mockFindOne()
    mockSuccessfulUpdate({ ownerName: "Ram" })

    const result = await service.update(
      baseSurvey.id,
      { ownerName: "Ram", gisUseCode: "R" },
      user
    )

    expect(result.surveyId).toBe("249044-001-000131-001-R")
    expect(prisma.survey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          surveyId: "249044-001-000131-001-R",
          parcelNo: "000131",
        }),
      })
    )
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SURVEY_UPDATED",
        newValue: expect.objectContaining({
          changes: expect.arrayContaining([
            expect.objectContaining({ field: "ownerName", new: "Ram" }),
          ]),
        }),
      })
    )
    const auditPayload = audit.log.mock.calls[0][0].newValue as {
      changes: Array<{ field: string }>
    }
    expect(auditPayload.changes.some((c) => c.field === "parcelNo")).toBe(false)
  })

  it("regenerates survey id when parcel changes (Test 2)", async () => {
    mockFindOne()
    mockSuccessfulUpdate({
      parcelNo: "000145",
      surveyId: "249044-001-000145-001-R",
    })

    const result = await service.update(
      baseSurvey.id,
      { parcelNo: "000145", gisUseCode: "R" },
      user
    )

    expect(result.surveyId).toBe("249044-001-000145-001-R")
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          changes: expect.arrayContaining([
            expect.objectContaining({
              field: "surveyId",
              new: "249044-001-000145-001-R",
            }),
          ]),
        }),
      })
    )
  })

  it("saves parcel and owner changes in one update (Test 3)", async () => {
    mockFindOne()
    mockSuccessfulUpdate({
      parcelNo: "000145",
      ownerName: "Ram",
      surveyId: "249044-001-000145-001-R",
    })

    await service.update(
      baseSurvey.id,
      { parcelNo: "000145", ownerName: "Ram", gisUseCode: "R" },
      user
    )

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    const auditPayload = audit.log.mock.calls[0][0].newValue as {
      changes: Array<{ field: string }>
    }
    const fields = auditPayload.changes.map((c) => c.field)
    expect(fields).toEqual(expect.arrayContaining(["parcelNo", "ownerName", "surveyId"]))
  })

  it("rejects duplicate parcel/property conflicts (Test 4)", async () => {
    mockFindOne()
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)
    )
    prisma.survey.findUnique.mockResolvedValue({
      id: "other-survey",
      surveyId: "249044-001-000145-001-R",
      deletedAt: null,
    })

    await expect(
      service.update(
        baseSurvey.id,
        { parcelNo: "000145", gisUseCode: "R" },
        user
      )
    ).rejects.toBeInstanceOf(ConflictException)

    expect(audit.log).not.toHaveBeenCalled()
  })

  it("rolls back when transaction fails (Test 5)", async () => {
    mockFindOne()
    prisma.$transaction.mockRejectedValue(new Error("commit failed"))

    await expect(
      service.update(
        baseSurvey.id,
        { parcelNo: "000145", gisUseCode: "R" },
        user
      )
    ).rejects.toThrow("commit failed")

    expect(audit.log).not.toHaveBeenCalled()
  })

  it("rejects client-provided survey id on update", async () => {
    mockFindOne()

    await expect(
      service.update(
        baseSurvey.id,
        {
          surveyId: "249044-001-000999-001-R",
          parcelNo: "000131",
          gisUseCode: "R",
        },
        user
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("creates survey with generated id", async () => {
    // Chhata-style ULB + 6-digit parcels (configuration, not the default).
    const previousUlb = process.env.ULB_CODE
    process.env.ULB_CODE = "249044"
    afterEachRestore.push(() => {
      if (previousUlb === undefined) delete process.env.ULB_CODE
      else process.env.ULB_CODE = previousUlb
    })
    prisma.survey.findUnique.mockResolvedValue(null)
    prisma.survey.create.mockResolvedValue({
      ...baseSurvey,
      surveyId: "249044-001-000131-001-R",
    })

    await service.create(
      {
        wardId: ward.id,
        parcelNo: "131",
        propertyNo: "1",
        gisUseCode: "R",
      },
      user
    )

    expect(prisma.survey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          surveyId: "249044-001-000131-001-R",
          parcelNo: "000131",
          propertyNo: "001",
        }),
      })
    )
  })

  describe("property images", () => {
    const frontKey =
      "property-images/800645/ward-003/800645-003-00031-006-R/front-view--b83c3c6a-5832-4f72-a9a3-c2d106103894.jpg"

    it("returns signed file URLs only for AVAILABLE images", async () => {
      const survey = {
        ...baseSurvey,
        attachments: [
          { id: "a1", objectKey: frontKey, mimeType: "image/jpeg", storageStatus: "AVAILABLE" },
          { id: "a2", objectKey: `${frontKey}-side`, mimeType: "image/jpeg", storageStatus: "PENDING_MIGRATION" },
          { id: "a3", objectKey: `${frontKey}-x`, mimeType: "image/jpeg", storageStatus: "FAILED" },
        ],
      }
      const result = await service.withAttachmentUrls(survey, user)

      expect(result.attachments?.map((a) => [a.id, a.url])).toEqual([
        ["a1", `/api/v1/files?key=${encodeURIComponent(frontKey)}&exp=1&sig=s`],
        ["a2", null],
        ["a3", null],
      ])
      for (const a of result.attachments ?? []) {
        expect(a.url ?? "").not.toMatch(/minio|:9000|MINIO_/i)
      }
    })

    it("migrates this survey's pending images and audits the run", async () => {
      mockFindOne()
      imageMigration.migrateSurveyImages.mockResolvedValue([
        { attachmentId: "a1", imageType: "Front View", outcome: "migrated" },
        { attachmentId: "a2", imageType: "Side View", outcome: "failed", error: "HTTP 404 from source" },
      ])

      const result = await service.migrateAttachments(baseSurvey.id, user)

      expect(imageMigration.migrateSurveyImages).toHaveBeenCalledWith(baseSurvey.id)
      expect(result).toEqual({
        attempted: 2,
        available: 1,
        failed: 1,
        results: [
          { attachmentId: "a1", imageType: "Front View", outcome: "migrated", error: null },
          { attachmentId: "a2", imageType: "Side View", outcome: "failed", error: "HTTP 404 from source" },
        ],
      })
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SURVEY_ATTACHMENTS_MIGRATED",
          entityId: baseSurvey.id,
          newValue: { attempted: 2, available: 1, failed: 1 },
        })
      )
    })

    it("does not let read-only users trigger a migration", async () => {
      mockFindOne()
      await expect(
        service.migrateAttachments(baseSurvey.id, { ...user, roles: ["VIEWER"], permissions: ["survey:read"] })
      ).rejects.toThrow()
      expect(imageMigration.migrateSurveyImages).not.toHaveBeenCalled()
    })
  })
})
