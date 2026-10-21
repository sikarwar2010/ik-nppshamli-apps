import {
  BadRequestException,
  ConflictException,
} from "@nestjs/common"
import { Test, TestingModule } from "@nestjs/testing"

import { AuditService } from "../audit/audit.service"
import { PrismaService } from "../prisma/prisma.service"
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SurveysService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: StorageService, useValue: {} },
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
})
