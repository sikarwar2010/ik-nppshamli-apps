import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import {
  DuplicateStrategy,
  ImportJobStatus,
  Prisma,
  SurveyStatus,
} from "@prisma/client"
import { SHAMLI_ULB_CODE, resolveImportSurveyId } from "@workspace/types"
import { Queue } from "bullmq"
import ExcelJS from "exceljs"
import IORedis from "ioredis"

import { AuditService } from "../audit/audit.service"
import type { AuthUser } from "../auth/auth.decorators"
import { PrismaService } from "../prisma/prisma.service"
import { StorageService } from "../storage/storage.service"
import { computeDataQuality, parseFloorsRaw } from "../surveys/floors.util"
import {
  diffSurveyChanges,
  surveyToAuditSnapshot,
} from "../surveys/survey-audit.util"
import { getUlbCode } from "../surveys/survey-id.util"
import {
  cell,
  detectPresetFromHeaders,
  extractWardNumber,
  normalizeParcelNo,
  normalizePropertyNo,
  parseBool,
  parseNumber,
  parseSurveyedAt,
  resolveColumnMap,
} from "./column-maps"
import {
  orphanSurveyWhere,
  shouldPruneOrphanCount,
  shouldReconcileWardAfterImport,
} from "./import-reconcile"
import {
  buildShamliExportFilename,
  buildShamliExportWorkbook,
} from "./shamli-excel-export"
import { ShamliImportService } from "./shamli-import.service"
import {
  SHAMLI_PRESET,
  isShamliSurveyHeaderRow,
  type WorkbookIssue,
} from "./shamli-workbook"
import {
  buildSurveyExportFilename,
  buildSurveyExportWorkbook,
  detectExportPreset,
  type SurveyExportRecord,
} from "./survey-excel-export"

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name)
  private queue: Queue | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly shamli: ShamliImportService
  ) {
    try {
      const connection = new IORedis(
        process.env.REDIS_URL ?? "redis://localhost:6379",
        {
          maxRetriesPerRequest: null,
        }
      )
      this.queue = new Queue("survey-import", { connection })
    } catch (err) {
      this.logger.warn(`BullMQ queue unavailable: ${String(err)}`)
    }
  }

  async createUpload(
    file: Express.Multer.File,
    user: AuthUser,
    duplicateStrategy: DuplicateStrategy = "UPDATE"
  ) {
    assertExcelUpload(file)
    if (!Object.values(DuplicateStrategy).includes(duplicateStrategy)) {
      throw new BadRequestException({
        code: "INVALID_DUPLICATE_STRATEGY",
        message: "duplicateStrategy must be SKIP, UPDATE or CREATE",
      })
    }
    const safeName = file.originalname.replace(/[^\w.-]+/g, "_").slice(0, 180)
    const objectKey = `imports/${Date.now()}-${safeName}`
    await this.storage.putObject(objectKey, file.buffer, file.mimetype)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet("Survey Data") ?? workbook.worksheets[0]
    const headerRow = sheet?.getRow(1)
    const columnCount = Math.max(
      headerRow?.cellCount ?? 0,
      sheet?.columnCount ?? 0
    )
    const headers: string[] = []
    for (let col = 1; col <= columnCount; col++) {
      headers[col - 1] = cell([headerRow?.getCell(col)?.value], 0)
    }
    if (isShamliSurveyHeaderRow(headers)) {
      return this.createShamliUpload(workbook, file, objectKey, user, duplicateStrategy)
    }
    const mappingPreset = detectPresetFromHeaders(headers, columnCount)

    const job = await this.prisma.importJob.create({
      data: {
        fileName: file.originalname,
        fileSize: file.size,
        objectKey,
        status: ImportJobStatus.READY,
        mappingPreset,
        duplicateStrategy,
        createdById: user.id,
        totalRows: Math.max(0, (sheet?.rowCount ?? 1) - 1),
      },
    })

    return job
  }

  /**
   * Shamli workbook upload: validate both sheets up front and store a dry-run
   * report (create / update / unchanged / conflicts) so staff can review it
   * before starting the import.
   */
  private async createShamliUpload(
    workbook: ExcelJS.Workbook,
    file: Express.Multer.File,
    objectKey: string,
    user: AuthUser,
    duplicateStrategy: DuplicateStrategy
  ) {
    const { report, issues } = await this.shamli.preview(
      workbook,
      file.originalname,
      duplicateStrategy
    )
    const structural = issues.some((i) => i.code === "HEADER_MISMATCH" || i.code === "SHEET_MISSING" || i.code === "UNEXPECTED_COLUMNS")
    const job = await this.prisma.importJob.create({
      data: {
        fileName: file.originalname,
        fileSize: file.size,
        objectKey,
        status: structural ? ImportJobStatus.FAILED : ImportJobStatus.READY,
        mappingPreset: SHAMLI_PRESET,
        duplicateStrategy,
        createdById: user.id,
        totalRows: report.surveys.total,
        report: report as unknown as Prisma.InputJsonValue,
      },
    })
    await this.saveIssues(job.id, issues)
    return job
  }

  /** Re-validate a job's workbook against the current database (read-only). */
  async preview(jobId: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } })
    if (!job) throw new NotFoundException("Import job not found")
    if (!job.objectKey) throw new BadRequestException("Import file missing")
    if (job.mappingPreset !== SHAMLI_PRESET) {
      throw new BadRequestException({
        code: "PREVIEW_UNSUPPORTED",
        message: "Preview is available for Shamli survey workbooks",
      })
    }
    const workbook = await this.loadWorkbook(job.objectKey)
    const { report, issues } = await this.shamli.preview(
      workbook,
      job.fileName,
      job.duplicateStrategy
    )
    const parse = this.shamli.parse(workbook)
    const sample = parse.surveys.slice(0, 25).map((row) => ({
      rowNumber: row.rowNumber,
      propertyId: row.values["Property Id"],
      status: row.values.Status,
      ownerName: row.values["Owner Name"],
      parcelNo: row.values["Parcel No"],
      unitNo: row.values["Unit No"],
      wardName: row.values["Ward Name"],
      floors: row.floors.length,
      errors: row.issues.filter((i) => i.severity === "error").length,
      warnings: row.issues.filter((i) => i.severity === "warning").length,
    }))
    return { job, report, issues: issues.slice(0, 500), sample }
  }

  private async processShamliJob(
    job: { id: string; fileName: string; duplicateStrategy: DuplicateStrategy; createdById: string | null },
    workbook: ExcelJS.Workbook
  ) {
    await this.prisma.importError.deleteMany({ where: { importJobId: job.id } })
    const { report, issues } = await this.shamli.run(workbook, job)
    await this.saveIssues(job.id, issues)

    const s = report.surveys
    const succeeded = s.created + s.updated + s.unchanged + s.skipped + s.revived
    const anyFailure = s.failed > 0 || report.images.failed > 0 || report.issues.byCode.HEADER_MISMATCH
    const status = !anyFailure
      ? ImportJobStatus.COMPLETED
      : succeeded > 0
        ? ImportJobStatus.PARTIAL
        : ImportJobStatus.FAILED

    return this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        mappingPreset: SHAMLI_PRESET,
        totalRows: s.total,
        processedRows: s.total,
        successRows: succeeded,
        failedRows: s.failed,
        skippedRows: s.skipped + s.unchanged,
        insertedRows: s.created,
        updatedRows: s.updated + s.revived,
        warningRows: s.warningRows,
        report: report as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    })
  }

  private async saveIssues(importJobId: string, issues: WorkbookIssue[]) {
    const rows = issues.map((issue) => ({
      importJobId,
      rowNumber: issue.rowNumber,
      sheet: issue.sheet,
      surveyId: issue.propertyId ?? null,
      field: issue.field ?? null,
      message: `[${issue.code}] ${issue.message}`,
      severity: issue.severity,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      await this.prisma.importError.createMany({ data: rows.slice(i, i + 500) })
    }
  }

  private async loadWorkbook(objectKey: string) {
    const buffer = await this.storage.getObject(objectKey)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    return workbook
  }

  async start(jobId: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } })
    if (!job) throw new NotFoundException("Import job not found")
    if (job.status === ImportJobStatus.FAILED && job.mappingPreset === SHAMLI_PRESET && job.processedRows === 0) {
      throw new BadRequestException({
        code: "IMPORT_INVALID",
        message: "This workbook failed validation; fix the listed sheet/column errors and upload again",
      })
    }
    if (job.status === ImportJobStatus.PROCESSING) {
      throw new BadRequestException({
        code: "IMPORT_RUNNING",
        message: "This import is already running",
      })
    }

    await this.prisma.importJob.update({
      where: { id: jobId },
      data: { status: ImportJobStatus.PROCESSING, startedAt: new Date() },
    })

    if (this.queue) {
      await this.queue.add("process", { jobId }, { removeOnComplete: 100 })
    } else {
      // Fallback: process inline when Redis is down
      await this.processJob(jobId)
    }

    return this.getJob(jobId)
  }

  async getJob(jobId: string) {
    const job = await this.prisma.importJob.findUnique({
      where: { id: jobId },
      // Errors before warnings so warnings never hide real failures.
      include: {
        errors: {
          take: 200,
          orderBy: [{ severity: "asc" }, { sheet: "desc" }, { rowNumber: "asc" }],
        },
      },
    })
    if (!job) throw new NotFoundException("Import job not found")
    return job
  }

  async list(
    page = 1,
    pageSize = 20,
    filters?: { status?: string; q?: string }
  ) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
    const safeSize =
      Number.isFinite(pageSize) && pageSize > 0
        ? Math.min(100, Math.floor(pageSize))
        : 20

    const where: Prisma.ImportJobWhereInput = {}
    const status = filters?.status?.trim()
    if (status) {
      if (!Object.values(ImportJobStatus).includes(status as ImportJobStatus)) {
        throw new BadRequestException("Invalid import status")
      }
      where.status = status as ImportJobStatus
    }
    const q = filters?.q?.trim()
    if (q) {
      where.fileName = { contains: q, mode: "insensitive" }
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.importJob.count({ where }),
      this.prisma.importJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),
    ])
    return {
      items,
      meta: {
        page: safePage,
        pageSize: safeSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeSize)),
      },
    }
  }

  async reprocessJob(jobId: string, duplicateStrategy: DuplicateStrategy) {
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        duplicateStrategy,
        status: ImportJobStatus.PROCESSING,
        startedAt: new Date(),
        completedAt: null,
        processedRows: 0,
        successRows: 0,
        failedRows: 0,
        skippedRows: 0,
        insertedRows: 0,
        updatedRows: 0,
        warningRows: 0,
      },
    })
    await this.prisma.importError.deleteMany({ where: { importJobId: jobId } })
    return this.processJob(jobId)
  }

  async processJob(jobId: string) {
    const job = await this.prisma.importJob.findUniqueOrThrow({
      where: { id: jobId },
    })
    if (!job.objectKey) throw new Error("Missing object key")

    const buffer = await this.storage.getObject(job.objectKey)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet("Survey Data") ?? workbook.worksheets[0]
    if (!sheet) throw new Error("Sheet not found")

    const columnCount = Math.max(sheet.columnCount, 1)
    const headerRow = sheet.getRow(1)
    const headers: string[] = []
    for (let col = 1; col <= columnCount; col++) {
      headers[col - 1] = cell([headerRow.getCell(col).value], 0)
    }
    if (job.mappingPreset === SHAMLI_PRESET || isShamliSurveyHeaderRow(headers)) {
      return this.processShamliJob(job, workbook)
    }
    // Always resolve from the file headers (do not trust a stale job preset —
    // v1-38 on aadhaar-shifted sheets mapped Floors → Road Type).
    const { preset, map } = resolveColumnMap(headers, columnCount)
    if (job.mappingPreset !== preset) {
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { mappingPreset: preset },
      })
    }
    const wards = await this.prisma.ward.findMany()
    const wardByNumber = new Map(wards.map((w) => [w.number, w]))

    let success = 0
    let failed = 0
    let skipped = 0
    let inserted = 0
    let updated = 0
    let processed = 0
    let pruned = 0
    const touchedSurveyIds = new Set<string>()
    const wardIdsSeen = new Set<string>()

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const excelRow = sheet.getRow(rowNumber)
      const values: unknown[] = []
      for (let col = 1; col <= columnCount; col++) {
        values[col - 1] = excelRow.getCell(col).value
      }

      const rawSurveyId = cell(values, map.surveyId)
      if (!rawSurveyId) continue
      processed++

      try {
        const wardName = cell(values, map.wardName)
        const wardNumber = extractWardNumber(wardName, rawSurveyId)
        const ward = wardNumber ? wardByNumber.get(wardNumber) : undefined
        if (!ward) {
          throw new Error(`Ward not found for ${wardName || rawSurveyId}`)
        }

        const mobileRaw = cell(values, map.mobile)
        const mobile = !mobileRaw || mobileRaw === "0" ? "" : mobileRaw
        const floorsRaw = cell(values, map.floorsRaw)
        const floors = parseFloorsRaw(floorsRaw)
        const plotAreaSqFt = parseNumber(cell(values, map.plotAreaSqFt))
        const plotAreaSqMeter = parseNumber(cell(values, map.plotAreaSqMeter))
        const plinthAreaSqFt = parseNumber(cell(values, map.plinthAreaSqFt))
        const plinthAreaSqMeter = parseNumber(
          cell(values, map.plinthAreaSqMeter)
        )
        const totalBuiltUpAreaSqFt = parseNumber(
          cell(values, map.totalBuiltUpAreaSqFt)
        )
        const totalBuiltUpAreaSqMeter = parseNumber(
          cell(values, map.totalBuiltUpAreaSqMeter)
        )
        const excelParcelRaw = cell(values, map.parcelNo)
        const excelPropertyRaw = cell(values, map.propertyNo)
        const parcelNo = normalizeParcelNo(excelParcelRaw, rawSurveyId)
        const propertyNo = normalizePropertyNo(excelPropertyRaw, rawSurveyId)
        const surveyId = resolveImportSurveyId(
          rawSurveyId,
          ward.number,
          parcelNo ?? "",
          propertyNo ?? "",
          getUlbCode()
        )

        const payload = {
          surveyId,
          wardId: ward.id,
          surveyedAt: parseSurveyedAt(cell(values, map.surveyedAt)),
          ownerName: cell(values, map.ownerName) || null,
          ownerFatherName: cell(values, map.ownerFatherName) || null,
          mobile: mobile || null,
          isSlum: parseBool(cell(values, map.isSlum)) ?? false,
          remark: cell(values, map.remark) || null,
          parcelNo,
          propertyNo,
          electricityId: cell(values, map.electricityId) || null,
          khasraNo: cell(values, map.khasraNo) || null,
          registryNo: cell(values, map.registryNo) || null,
          constructedDate: cell(values, map.constructedDate) || null,
          respondentName: cell(values, map.respondentName) || null,
          respondentRelationship:
            cell(values, map.respondentRelationship) || null,
          city: cell(values, map.city) || null,
          pincode: cell(values, map.pincode) || null,
          houseNo: cell(values, map.houseNo) || null,
          streetName: cell(values, map.streetName) || null,
          locality: cell(values, map.locality) || null,
          colony: cell(values, map.colony) || null,
          presentHouseNo: cell(values, map.presentHouseNo) || null,
          presentStreetName: cell(values, map.presentStreetName) || null,
          presentLocality: cell(values, map.presentLocality) || null,
          presentColony: cell(values, map.presentColony) || null,
          presentCity: cell(values, map.presentCity) || null,
          presentPincode: cell(values, map.presentPincode) || null,
          isSameAsProperty: parseBool(cell(values, map.isSameAsProperty)),
          taxRateZone: cell(values, map.taxRateZone) || null,
          propertyOwnership: cell(values, map.propertyOwnership) || null,
          propertyUse: cell(values, map.propertyUse) || null,
          commercial: cell(values, map.commercial) || null,
          yearOfConstruction: cell(values, map.yearOfConstruction) || null,
          exemptionType: cell(values, map.exemptionType) || null,
          exemptionApplicable: parseBool(cell(values, map.exemptionApplicable)),
          situation: cell(values, map.situation) || null,
          roadType: cell(values, map.roadType) || null,
          floorsRaw: floorsRaw || null,
          plotAreaSqFt,
          plotAreaSqMeter,
          plinthAreaSqFt,
          plinthAreaSqMeter,
          totalBuiltUpAreaSqFt,
          totalBuiltUpAreaSqMeter,
          hasMunicipalWaterSupply: parseBool(
            cell(values, map.hasMunicipalWaterSupply)
          ),
          hasAlternateWater: parseBool(cell(values, map.hasAlternateWater)),
          waterSourceType: cell(values, map.waterSourceType) || null,
          totalWaterConnections: parseNumber(
            cell(values, map.totalWaterConnections)
          ),
          waterConnectionIdType:
            cell(values, map.waterConnectionIdType) || null,
          toiletType: cell(values, map.toiletType) || null,
          hasMunicipalWasteService: parseBool(
            cell(values, map.hasMunicipalWasteService)
          ),
          ownerAadhaar: cell(values, map.ownerAadhaar) || null,
          dataQualityStatus: computeDataQuality({
            mobile,
            propertyNo,
            parcelNo,
            plotAreaSqFt,
            totalBuiltUpAreaSqFt,
          }),
          importJobId: job.id,
          status: "ACTIVE" as const,
        }

        const existing = await this.findImportDuplicate({
          surveyId,
          rawSurveyId,
          wardId: ward.id,
          parcelNo,
          propertyNo,
        })

        if (existing) {
          const isSoftDeleted = existing.deletedAt != null
          if (job.duplicateStrategy === "SKIP" && !isSoftDeleted) {
            skipped++
            success++
            touchedSurveyIds.add(existing.id)
            wardIdsSeen.add(ward.id)
            continue
          }
          // UPDATE strategy, or soft-deleted row (must revive — surveyId is still unique).
          if (job.duplicateStrategy === "UPDATE" || isSoftDeleted) {
            const beforeAudit = surveyToAuditSnapshot(
              existing as unknown as Record<string, unknown>
            )
            const updatedSurvey = await this.prisma.$transaction(async (tx) => {
              await tx.surveyFloor.deleteMany({
                where: { surveyId: existing.id },
              })
              return tx.survey.update({
                where: { id: existing.id },
                data: {
                  ...payload,
                  deletedAt: null,
                  status: "ACTIVE",
                  floors: {
                    create: floors.map((f) => ({
                      floorLabel: f.floorLabel,
                      areaSqFt: f.areaSqFt,
                      areaSqMeter: f.areaSqMeter,
                      usageType: f.usageType,
                      usageFactor: f.usageFactor,
                      buildingType: f.buildingType,
                      sortOrder: f.sortOrder,
                      rawSegment: f.rawSegment,
                    })),
                  },
                },
              })
            })
            const afterAudit = surveyToAuditSnapshot(
              updatedSurvey as unknown as Record<string, unknown>
            )
            const auditDiff = diffSurveyChanges(beforeAudit, afterAudit)
            if (auditDiff.changes.length > 0) {
              await this.audit.log({
                action: "SURVEY_UPDATED",
                entity: "Survey",
                entityId: existing.id,
                actorId: job.createdById ?? undefined,
                newValue: {
                  changes: auditDiff.changes,
                  source: "import",
                  revived: isSoftDeleted,
                } as Prisma.InputJsonValue,
              })
            }
            updated++
            success++
            touchedSurveyIds.add(existing.id)
            wardIdsSeen.add(ward.id)
            continue
          }
        }

        try {
          const created = await this.prisma.survey.create({
            data: {
              ...payload,
              floors: {
                create: floors.map((f) => ({
                  floorLabel: f.floorLabel,
                  areaSqFt: f.areaSqFt,
                  areaSqMeter: f.areaSqMeter,
                  usageType: f.usageType,
                  usageFactor: f.usageFactor,
                  buildingType: f.buildingType,
                  sortOrder: f.sortOrder,
                  rawSegment: f.rawSegment,
                })),
              },
            },
          })
          inserted++
          success++
          touchedSurveyIds.add(created.id)
          wardIdsSeen.add(ward.id)
        } catch (createErr) {
          // Race / leftover soft-delete: unique surveyId — revive that row instead.
          if (
            createErr instanceof Prisma.PrismaClientKnownRequestError &&
            createErr.code === "P2002"
          ) {
            const conflict = await this.prisma.survey.findUnique({
              where: { surveyId },
            })
            if (conflict) {
              await this.prisma.$transaction(async (tx) => {
                await tx.surveyFloor.deleteMany({
                  where: { surveyId: conflict.id },
                })
                await tx.survey.update({
                  where: { id: conflict.id },
                  data: {
                    ...payload,
                    deletedAt: null,
                    status: "ACTIVE",
                    floors: {
                      create: floors.map((f) => ({
                        floorLabel: f.floorLabel,
                        areaSqFt: f.areaSqFt,
                        areaSqMeter: f.areaSqMeter,
                        usageType: f.usageType,
                        usageFactor: f.usageFactor,
                        buildingType: f.buildingType,
                        sortOrder: f.sortOrder,
                        rawSegment: f.rawSegment,
                      })),
                    },
                  },
                })
              })
              updated++
              success++
              touchedSurveyIds.add(conflict.id)
              wardIdsSeen.add(ward.id)
              continue
            }
          }
          throw createErr
        }
      } catch (err) {
        failed++
        await this.prisma.importError.create({
          data: {
            importJobId: job.id,
            rowNumber,
            surveyId: rawSurveyId || null,
            message: formatImportErrorMessage(err),
            severity: "error",
          },
        })
      }
    }

    const reconcileWardId = shouldReconcileWardAfterImport({
      duplicateStrategy: job.duplicateStrategy,
      failedRows: failed,
      wardIdsSeen,
      touchedSurveyIds,
    })
    if (reconcileWardId) {
      pruned = await this.reconcileWardOrphans({
        wardId: reconcileWardId,
        keepSurveyIds: touchedSurveyIds,
        importJobId: job.id,
        actorId: job.createdById,
      })
      if (pruned > 0) {
        this.logger.log(
          `Import ${job.id}: soft-deleted ${pruned} orphan survey(s) in ward ${reconcileWardId} not present in file`
        )
      }
    }

    const status =
      failed === 0
        ? ImportJobStatus.COMPLETED
        : success > 0
          ? ImportJobStatus.PARTIAL
          : ImportJobStatus.FAILED

    return this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        processedRows: processed,
        successRows: success,
        failedRows: failed,
        skippedRows: skipped,
        insertedRows: inserted,
        updatedRows: updated,
        warningRows: pruned,
        completedAt: new Date(),
      },
    })
  }

  /**
   * Soft-delete surveys in a ward that were not touched by a successful
   * single-ward UPDATE import (file is source of truth for that ward).
   */
  private async reconcileWardOrphans(input: {
    wardId: string
    keepSurveyIds: ReadonlySet<string>
    importJobId: string
    actorId: string | null
  }): Promise<number> {
    const orphans = await this.prisma.survey.findMany({
      where: orphanSurveyWhere(input.wardId, input.keepSurveyIds),
      select: { id: true, surveyId: true },
    })
    if (orphans.length === 0) return 0

    if (!shouldPruneOrphanCount(orphans.length, input.keepSurveyIds.size)) {
      this.logger.warn(
        `Import ${input.importJobId}: skipped reconcile for ward ${input.wardId} — ${orphans.length} orphan(s) exceeds safe prune cap (kept ${input.keepSurveyIds.size}). Re-upload the full ward file or prune manually.`
      )
      return 0
    }

    const now = new Date()
    await this.prisma.survey.updateMany({
      where: { id: { in: orphans.map((o) => o.id) } },
      data: { status: "DELETED", deletedAt: now },
    })

    for (const orphan of orphans) {
      await this.audit.log({
        action: "SURVEY_DELETED",
        entity: "Survey",
        entityId: orphan.id,
        actorId: input.actorId ?? undefined,
        oldValue: {
          surveyId: orphan.surveyId,
          source: "import-reconcile",
          importJobId: input.importJobId,
        } as Prisma.InputJsonValue,
      })
    }

    return orphans.length
  }

  /** Match existing survey by canonical id, legacy Excel id, or ward+parcel+property. */
  private async findImportDuplicate(input: {
    surveyId: string
    rawSurveyId: string
    wardId: string
    parcelNo: string | null
    propertyNo: string | null
  }) {
    const byCanonical = await this.prisma.survey.findUnique({
      where: { surveyId: input.surveyId },
    })
    // Include soft-deleted: surveyId is globally unique and create would P2002.
    if (byCanonical) return byCanonical

    if (input.rawSurveyId !== input.surveyId) {
      const byRaw = await this.prisma.survey.findUnique({
        where: { surveyId: input.rawSurveyId },
      })
      if (byRaw) return byRaw
    }

    if (input.parcelNo && input.propertyNo) {
      return this.prisma.survey.findFirst({
        where: {
          wardId: input.wardId,
          parcelNo: input.parcelNo,
          propertyNo: input.propertyNo,
          deletedAt: null,
        },
      })
    }

    return null
  }

  async exportSurveys(
    filters: { wardId?: string; status?: string; format?: string },
    user: AuthUser
  ) {
    const ward = filters.wardId
      ? await this.prisma.ward.findUnique({ where: { id: filters.wardId } })
      : null
    if (filters.status && !Object.values(SurveyStatus).includes(filters.status as SurveyStatus)) {
      throw new BadRequestException({ code: "INVALID_STATUS", message: "Invalid survey status" })
    }

    const useShamliLayout =
      filters.format === "shamli" ||
      (filters.format !== "chhata" && getUlbCode() === SHAMLI_ULB_CODE)
    if (useShamliLayout) {
      return this.exportShamliSurveys(
        { wardId: filters.wardId, status: filters.status as SurveyStatus | undefined },
        ward?.number,
        user
      )
    }

    const surveys = await this.prisma.survey.findMany({
      where: {
        deletedAt: null,
        status: filters.status ? (filters.status as never) : { not: "DELETED" },
        ...(filters.wardId ? { wardId: filters.wardId } : {}),
      },
      include: { ward: true },
      orderBy: [
        { ward: { number: "asc" } },
        { parcelNo: "asc" },
        { surveyId: "asc" },
      ],
      take: 50000,
    })

    const preset = detectExportPreset(ward?.number)
    const workbook = buildSurveyExportWorkbook(
      surveys as SurveyExportRecord[],
      preset
    )
    const fileName = buildSurveyExportFilename({ wardNumber: ward?.number })

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    const objectKey = `exports/${fileName}`
    await this.storage.putObject(
      objectKey,
      buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    const job = await this.prisma.exportJob.create({
      data: {
        filters,
        status: "COMPLETED",
        fileKey: objectKey,
        fileName,
        rowCount: surveys.length,
        createdById: user.id,
        completedAt: new Date(),
      },
    })

    const url = await this.storage.getSignedUrl(objectKey, 600)
    return { job, url }
  }

  /** Same column names, order and cell types as the Shamli source workbook. */
  private async exportShamliSurveys(
    filters: { wardId?: string; status?: SurveyStatus },
    wardNumber: number | undefined,
    user: AuthUser
  ) {
    const surveys = await this.prisma.survey.findMany({
      where: {
        deletedAt: null,
        status: filters.status ?? { not: "DELETED" },
        ...(filters.wardId ? { wardId: filters.wardId } : {}),
      },
      include: {
        ward: { select: { number: true, name: true } },
        attachments: {
          select: {
            imageType: true,
            originalFileName: true,
            sourceUrl: true,
            sourceRowNumber: true,
            mimeType: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      take: 50000,
    })
    const workbook = buildShamliExportWorkbook(surveys)
    const fileName = buildShamliExportFilename(wardNumber)
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    const objectKey = `exports/${Date.now()}-${fileName}`
    await this.storage.putObject(
      objectKey,
      buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    const job = await this.prisma.exportJob.create({
      data: {
        filters: { ...filters, format: "shamli" },
        status: "COMPLETED",
        fileKey: objectKey,
        fileName,
        rowCount: surveys.length,
        createdById: user.id,
        completedAt: new Date(),
      },
    })
    const url = await this.storage.getSignedUrl(objectKey, 600)
    return { job, url }
  }
}

const XLSX_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
  "application/zip",
])

/** Workbook uploads: required, .xlsx, ZIP container bytes, size limit. */
export function assertExcelUpload(file: Express.Multer.File | undefined) {
  if (!file?.buffer?.length) {
    throw new BadRequestException({
      code: "FILE_REQUIRED",
      message: "An .xlsx workbook is required",
    })
  }
  const maxMb = Number(process.env.IMPORT_MAX_FILE_SIZE_MB ?? 50)
  if (file.size > maxMb * 1024 * 1024) {
    throw new BadRequestException({
      code: "FILE_TOO_LARGE",
      message: `Workbook must be under ${maxMb}MB`,
    })
  }
  const isZip =
    file.buffer[0] === 0x50 &&
    file.buffer[1] === 0x4b &&
    file.buffer[2] === 0x03 &&
    file.buffer[3] === 0x04
  if (
    !/\.xlsx$/i.test(file.originalname) ||
    !isZip ||
    (file.mimetype && !XLSX_MIME.has(file.mimetype))
  ) {
    throw new BadRequestException({
      code: "INVALID_FILE_TYPE",
      message: "Only .xlsx Excel workbooks can be imported",
    })
  }
}

/** Short, actionable import error text (avoid dumping full Prisma invoke stacks). */
function formatImportErrorMessage(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = Array.isArray(err.meta?.target)
        ? (err.meta.target as string[]).join(", ")
        : String(err.meta?.target ?? "unique field")
      return `Duplicate value for ${target}. Another survey already uses this Survey Id / identity.`
    }
    if (err.code === "P2003") {
      return "Related record missing (foreign key). Check ward / reference data."
    }
    return `Database error ${err.code}: ${err.message.split("\n")[0] ?? err.message}`
  }
  if (err instanceof Error) {
    const first = err.message.split("\n")[0]?.trim()
    return first && first.length > 0 ? first : "Import row failed"
  }
  return "Import row failed"
}
