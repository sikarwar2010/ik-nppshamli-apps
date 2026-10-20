import { Injectable, Logger } from "@nestjs/common"
import {
  type DuplicateStrategy,
  Prisma,
  type Survey,
  type SurveyAttachment,
  type SurveyFloor,
} from "@prisma/client"
import type ExcelJS from "exceljs"

import { AuditService } from "../audit/audit.service"
import { PrismaService } from "../prisma/prisma.service"
import { StorageService } from "../storage/storage.service"
import { computeDataQuality } from "../surveys/floors.util"
import { getUlbCode } from "../surveys/survey-id.util"
import {
  IMAGE_SHEET,
  SHAMLI_PRESET,
  SURVEY_SHEET,
  buildPropertyImageKey,
  guessImageMime,
  parseShamliWorkbook,
  type ParsedImageRow,
  type ParsedSurveyRow,
  type ShamliSurveyData,
  type ShamliWorkbookParse,
  type WorkbookIssue,
} from "./shamli-workbook"

/** Typed survey columns compared on re-import (wardId handled separately). */
export const COMPARED_FIELDS = [
  "sourceStatus",
  "status",
  "surveyorName",
  "assessmentYear",
  "surveyedAt",
  "ownerName",
  "ownerFatherName",
  "mobile",
  "isSlum",
  "parcelNo",
  "propertyNo",
  "oldPropertyNo",
  "constructedDate",
  "respondentName",
  "respondentRelationship",
  "city",
  "pincode",
  "houseNo",
  "locality",
  "colony",
  "taxRateZone",
  "propertyOwnership",
  "propertyType",
  "propertyUse",
  "situation",
  "roadType",
  "floorsRaw",
  "plotAreaSqFt",
  "plinthAreaSqFt",
  "totalBuiltUpAreaSqFt",
  "hasMunicipalWaterSupply",
  "totalWaterConnections",
  "waterConnectionIdType",
  "toiletType",
  "hasMunicipalWasteService",
  "latitude",
  "longitude",
] as const satisfies ReadonlyArray<keyof ShamliSurveyData & keyof Survey>

export type ComparedField = (typeof COMPARED_FIELDS)[number]

export type FieldChange = { field: string; from: unknown; to: unknown }

type RowOutcome =
  | "created"
  | "updated"
  | "unchanged"
  | "skipped"
  | "revived"
  | "failed"

export type ShamliImportReport = {
  preset: typeof SHAMLI_PRESET
  fileName: string
  mode: "preview" | "import"
  duplicateStrategy: DuplicateStrategy
  generatedAt: string
  sheets: Record<string, { rows: number }>
  surveys: Record<RowOutcome | "total" | "warningRows", number>
  images: Record<
    "total" | "created" | "updated" | "unchanged" | "failed" | "pendingMigration",
    number
  >
  issues: { errors: number; warnings: number; byCode: Record<string, number> }
  duplicateCandidates: ShamliWorkbookParse["duplicateCandidates"]
  conflicts: Array<{ rowNumber: number; propertyId: string; message: string }>
  /** Storage keys of rollback artefacts (import mode only). */
  snapshotKey?: string
  resultKey?: string
}

export type ShamliRunResult = {
  report: ShamliImportReport
  issues: WorkbookIssue[]
}

type ExistingSurvey = Survey & {
  floors: SurveyFloor[]
  attachments: SurveyAttachment[]
}

function normalizeForCompare(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (Prisma.Decimal.isDecimal(value)) {
    return new Prisma.Decimal(value as Prisma.Decimal.Value).toString()
  }
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    // Decimal text from the workbook vs Decimal from Postgres.
    return new Prisma.Decimal(value).toString()
  }
  return String(value)
}

/** Field-level differences between a DB survey and parsed workbook data. */
export function diffSurvey(
  existing: Pick<Survey, ComparedField | "wardId">,
  data: ShamliSurveyData,
  wardId: string
): FieldChange[] {
  const changes: FieldChange[] = []
  if (existing.wardId !== wardId) {
    changes.push({ field: "wardId", from: existing.wardId, to: wardId })
  }
  for (const field of COMPARED_FIELDS) {
    const from = existing[field]
    const to = data[field]
    // Numeric-looking text columns (Mobile, Pincode…) must compare as text so
    // "0000000000" never equals "0".
    const textual = typeof from === "string" && typeof to === "string"
    const same = textual
      ? from === to
      : normalizeForCompare(from) === normalizeForCompare(to)
    if (!same) {
      changes.push({
        field,
        from: normalizeForCompare(from),
        to: normalizeForCompare(to),
      })
    }
  }
  return changes
}

function surveyWriteData(
  row: ParsedSurveyRow,
  data: ShamliSurveyData,
  ctx: { wardId: string; jobId: string | null; fileName: string },
  previousExtras: Prisma.JsonValue | null
): Prisma.SurveyUncheckedUpdateInput & Prisma.SurveyUncheckedCreateInput {
  const extras =
    previousExtras && typeof previousExtras === "object" && !Array.isArray(previousExtras)
      ? (previousExtras as Prisma.JsonObject)
      : {}
  return {
    ...data,
    wardId: ctx.wardId,
    sourceRowNumber: row.rowNumber,
    importJobId: ctx.jobId,
    dataQualityStatus: computeDataQuality({
      mobile: data.mobile,
      propertyNo: data.propertyNo,
      parcelNo: data.parcelNo,
      plotAreaSqFt: data.plotAreaSqFt != null ? Number(data.plotAreaSqFt) : null,
      totalBuiltUpAreaSqFt:
        data.totalBuiltUpAreaSqFt != null ? Number(data.totalBuiltUpAreaSqFt) : null,
    }),
    sourceExtras: {
      ...extras,
      source: {
        preset: SHAMLI_PRESET,
        file: ctx.fileName,
        sheet: SURVEY_SHEET,
        rowNumber: row.rowNumber,
        sn: row.sn,
        values: row.values,
      },
    },
  }
}

function floorCreates(row: ParsedSurveyRow) {
  return row.floors.map((f) => ({
    floorLabel: f.floorLabel,
    areaSqFt: f.areaSqFt,
    areaSqMeter: f.areaSqMeter,
    usageType: f.usageType,
    usageFactor: f.usageFactor,
    buildingType: f.buildingType,
    sortOrder: f.sortOrder,
    rawSegment: f.rawSegment,
  }))
}

function emptyReport(
  parse: ShamliWorkbookParse,
  fileName: string,
  mode: "preview" | "import",
  duplicateStrategy: DuplicateStrategy
): ShamliImportReport {
  return {
    preset: SHAMLI_PRESET,
    fileName,
    mode,
    duplicateStrategy,
    generatedAt: new Date().toISOString(),
    sheets: Object.fromEntries(
      Object.entries(parse.sheetRowCounts).map(([k, rows]) => [k, { rows }])
    ),
    surveys: {
      total: parse.surveys.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      revived: 0,
      failed: 0,
      warningRows: 0,
    },
    images: {
      total: parse.images.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      pendingMigration: 0,
    },
    issues: { errors: 0, warnings: 0, byCode: {} },
    duplicateCandidates: parse.duplicateCandidates,
    conflicts: [],
  }
}

function tallyIssues(report: ShamliImportReport, issues: WorkbookIssue[]) {
  for (const issue of issues) {
    if (issue.severity === "error") report.issues.errors++
    else report.issues.warnings++
    report.issues.byCode[issue.code] = (report.issues.byCode[issue.code] ?? 0) + 1
  }
}

/**
 * Ward-safe, idempotent importer for the Shamli survey workbook.
 *
 * Identity is the exact source Property Id. A match in another ward is a
 * conflict (never overwritten). Parcel+Unit is NOT used for matching — the
 * source has distinct Property Ids sharing a parcel/unit pair.
 * Unlike the Chhata presets, records missing from the file are never pruned.
 */
@Injectable()
export class ShamliImportService {
  private readonly logger = new Logger(ShamliImportService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  parse(workbook: ExcelJS.Workbook): ShamliWorkbookParse {
    return parseShamliWorkbook(workbook, { ulbCode: getUlbCode() })
  }

  /** Dry run: validation + create/update/unchanged/conflict classification. */
  async preview(
    workbook: ExcelJS.Workbook,
    fileName: string,
    duplicateStrategy: DuplicateStrategy = "UPDATE"
  ): Promise<ShamliRunResult> {
    return this.execute(workbook, {
      mode: "preview",
      fileName,
      duplicateStrategy,
      jobId: null,
      actorId: null,
    })
  }

  async run(
    workbook: ExcelJS.Workbook,
    job: {
      id: string
      fileName: string
      duplicateStrategy: DuplicateStrategy
      createdById: string | null
    }
  ): Promise<ShamliRunResult> {
    return this.execute(workbook, {
      mode: "import",
      fileName: job.fileName,
      duplicateStrategy: job.duplicateStrategy,
      jobId: job.id,
      actorId: job.createdById,
    })
  }

  private async execute(
    workbook: ExcelJS.Workbook,
    ctx: {
      mode: "preview" | "import"
      fileName: string
      duplicateStrategy: DuplicateStrategy
      jobId: string | null
      actorId: string | null
    }
  ): Promise<ShamliRunResult> {
    const parse = this.parse(workbook)
    const report = emptyReport(parse, ctx.fileName, ctx.mode, ctx.duplicateStrategy)
    const issues: WorkbookIssue[] = [...parse.structuralErrors]
    if (parse.structuralErrors.length > 0) {
      tallyIssues(report, issues)
      return { report, issues }
    }
    const write = ctx.mode === "import"

    const wards = await this.prisma.ward.findMany()
    const wardByNumber = new Map(wards.map((w) => [w.number, w]))
    const propertyIds = parse.surveys
      .map((s) => s.data?.surveyId)
      .filter((id): id is string => Boolean(id))
    const existingRows: ExistingSurvey[] = await this.prisma.survey.findMany({
      where: { surveyId: { in: propertyIds } },
      include: { floors: true, attachments: true },
    })
    const existingById = new Map(existingRows.map((s) => [s.surveyId, s]))

    if (write && ctx.jobId) {
      report.snapshotKey = await this.writeArtifact(ctx.jobId, "pre-import-snapshot.json", {
        jobId: ctx.jobId,
        takenAt: new Date().toISOString(),
        note: "Rows that existed before this import, for rollback (scripts/rollback-shamli-import.ts).",
        surveys: existingRows,
      })
    }

    const createdSurveyIds: string[] = []
    const updatedSurveyIds: string[] = []
    const createdAttachmentIds: string[] = []
    /** Property Id → DB survey id for rows importable in this run. */
    const surveyDbIds = new Map<string, { id: string; wardNumber: number } | null>()

    for (const row of parse.surveys) {
      const rowIssues = [...row.issues]
      const outcome = await this.importSurveyRow(row, rowIssues, {
        ...ctx,
        write,
        wardByNumber,
        existingById,
        report,
        surveyDbIds,
        createdSurveyIds,
        updatedSurveyIds,
      })
      report.surveys[outcome]++
      if (rowIssues.some((i) => i.severity === "warning")) report.surveys.warningRows++
      issues.push(...rowIssues)
    }

    for (const row of parse.images) {
      const rowIssues = [...row.issues]
      await this.importImageRow(row, rowIssues, {
        ...ctx,
        write,
        report,
        surveyDbIds,
        existingById,
        createdAttachmentIds,
      })
      issues.push(...rowIssues)
    }

    tallyIssues(report, issues)

    if (write && ctx.jobId) {
      report.resultKey = await this.writeArtifact(ctx.jobId, "import-result.json", {
        jobId: ctx.jobId,
        finishedAt: new Date().toISOString(),
        createdSurveyIds,
        updatedSurveyIds,
        createdAttachmentIds,
      })
    }
    return { report, issues }
  }

  private async importSurveyRow(
    row: ParsedSurveyRow,
    rowIssues: WorkbookIssue[],
    ctx: {
      write: boolean
      fileName: string
      duplicateStrategy: DuplicateStrategy
      jobId: string | null
      actorId: string | null
      wardByNumber: Map<number, { id: string; number: number }>
      existingById: Map<string, ExistingSurvey>
      report: ShamliImportReport
      surveyDbIds: Map<string, { id: string; wardNumber: number } | null>
      createdSurveyIds: string[]
      updatedSurveyIds: string[]
    }
  ): Promise<RowOutcome> {
    const fail = (code: string, message: string, field?: string): RowOutcome => {
      rowIssues.push({
        sheet: SURVEY_SHEET,
        rowNumber: row.rowNumber,
        severity: "error",
        code,
        message,
        field,
        propertyId: row.values["Property Id"] || undefined,
      })
      return "failed"
    }

    const data = row.data
    if (!data) return "failed"
    const ward = row.wardNumber != null ? ctx.wardByNumber.get(row.wardNumber) : undefined
    if (!ward) {
      return fail("WARD_NOT_FOUND", `Ward ${row.wardNumber} ("${row.wardLabel}") does not exist in the portal`, "Ward Name")
    }

    const existing = ctx.existingById.get(data.surveyId)
    if (existing && existing.wardId !== ward.id) {
      const message = `Property Id ${data.surveyId} already belongs to another ward; not overwritten`
      ctx.report.conflicts.push({ rowNumber: row.rowNumber, propertyId: data.surveyId, message })
      return fail("CROSS_WARD_CONFLICT", message, "Property Id")
    }

    const write = surveyWriteData(row, data, { wardId: ward.id, jobId: ctx.jobId, fileName: ctx.fileName }, existing?.sourceExtras ?? null)

    try {
      if (!existing) {
        ctx.surveyDbIds.set(data.surveyId, null)
        if (ctx.write) {
          const created = await this.prisma.survey.create({
            data: {
              ...(write as Prisma.SurveyUncheckedCreateInput),
              createdById: ctx.actorId,
              floors: { create: floorCreates(row) },
            },
          })
          ctx.surveyDbIds.set(data.surveyId, { id: created.id, wardNumber: ward.number })
          ctx.createdSurveyIds.push(created.id)
          await this.audit.log({
            action: "SURVEY_CREATED",
            entity: "Survey",
            entityId: created.id,
            actorId: ctx.actorId ?? undefined,
            newValue: { surveyId: data.surveyId, source: "import", importJobId: ctx.jobId, row: row.rowNumber },
          })
        }
        return "created"
      }

      ctx.surveyDbIds.set(data.surveyId, { id: existing.id, wardNumber: ward.number })
      const isDeleted = existing.deletedAt != null || existing.status === "DELETED"
      if (ctx.duplicateStrategy === "SKIP" && !isDeleted) return "skipped"
      if (ctx.duplicateStrategy === "CREATE") {
        return fail("DUPLICATE_PROPERTY_ID", `Property Id ${data.surveyId} already exists (strategy CREATE never overwrites)`, "Property Id")
      }

      const changes = diffSurvey(existing, data, ward.id)
      if (changes.length === 0 && !isDeleted) {
        if (ctx.write && existing.sourceRowNumber !== row.rowNumber) {
          // Only provenance moved (row re-ordered); record it without an audit diff.
          await this.prisma.survey.update({
            where: { id: existing.id },
            data: { sourceRowNumber: row.rowNumber, sourceExtras: write.sourceExtras, importJobId: ctx.jobId },
          })
        }
        return "unchanged"
      }

      if (ctx.write) {
        const floorsChanged = changes.some((c) => c.field === "floorsRaw")
        await this.prisma.$transaction(async (tx) => {
          if (floorsChanged) {
            await tx.surveyFloor.deleteMany({ where: { surveyId: existing.id } })
          }
          await tx.survey.update({
            where: { id: existing.id },
            data: {
              ...write,
              deletedAt: null,
              updatedById: ctx.actorId,
              ...(floorsChanged ? { floors: { create: floorCreates(row) } } : {}),
            },
          })
        })
        ctx.updatedSurveyIds.push(existing.id)
        await this.audit.log({
          action: "SURVEY_UPDATED",
          entity: "Survey",
          entityId: existing.id,
          actorId: ctx.actorId ?? undefined,
          newValue: {
            changes,
            source: "import",
            importJobId: ctx.jobId,
            row: row.rowNumber,
            revived: isDeleted,
          } as unknown as Prisma.InputJsonValue,
        })
      }
      return isDeleted ? "revived" : "updated"
    } catch (err) {
      this.logger.error(`Survey row ${row.rowNumber} failed: ${String(err)}`)
      return fail("DB_WRITE_FAILED", describeDbError(err))
    }
  }

  private async importImageRow(
    row: ParsedImageRow,
    rowIssues: WorkbookIssue[],
    ctx: {
      write: boolean
      jobId: string | null
      report: ShamliImportReport
      surveyDbIds: Map<string, { id: string; wardNumber: number } | null>
      existingById: Map<string, ExistingSurvey>
    } & { createdAttachmentIds: string[] }
  ) {
    const images = ctx.report.images
    const fail = (code: string, message: string, field?: string) => {
      rowIssues.push({
        sheet: IMAGE_SHEET,
        rowNumber: row.rowNumber,
        severity: "error",
        code,
        message,
        field,
        propertyId: row.propertyId || undefined,
      })
      images.failed++
    }
    if (rowIssues.some((i) => i.severity === "error")) {
      images.failed++
      return
    }
    if (!ctx.surveyDbIds.has(row.propertyId)) {
      return fail("IMAGE_SURVEY_NOT_IMPORTED", `Survey ${row.propertyId} was not imported (see its Survey Data row), so this image cannot be linked`, "Property ID")
    }
    const target = ctx.surveyDbIds.get(row.propertyId)
    const existing = ctx.existingById
      .get(row.propertyId)
      ?.attachments.find((a) => a.sourceUrl === row.sourceUrl)

    const meta = {
      imageType: row.imageType,
      originalFileName: row.imageName,
      sourceRowNumber: row.rowNumber,
    }
    if (existing) {
      const changed =
        existing.imageType !== meta.imageType ||
        existing.originalFileName !== meta.originalFileName ||
        existing.sourceRowNumber !== meta.sourceRowNumber
      if (!changed) {
        images.unchanged++
      } else {
        images.updated++
        if (ctx.write) {
          await this.prisma.surveyAttachment.update({
            where: { id: existing.id },
            data: { ...meta, importJobId: ctx.jobId },
          })
        }
      }
      if (existing.storageStatus !== "AVAILABLE") images.pendingMigration++
      return
    }

    if (!ctx.write) {
      images.created++
      images.pendingMigration++
      return
    }
    if (!target) {
      return fail("IMAGE_SURVEY_NOT_IMPORTED", `Survey ${row.propertyId} has no database id`)
    }
    images.created++
    images.pendingMigration++
    try {
      const created = await this.prisma.surveyAttachment.upsert({
        where: { surveyId_sourceUrl: { surveyId: target.id, sourceUrl: row.sourceUrl } },
        update: { ...meta, importJobId: ctx.jobId },
        create: {
          ...meta,
          surveyId: target.id,
          sourceUrl: row.sourceUrl,
          importJobId: ctx.jobId,
          storageStatus: "PENDING_MIGRATION",
          objectKey: buildPropertyImageKey({
            ulbCode: getUlbCode(),
            wardNumber: target.wardNumber,
            propertyId: row.propertyId,
            imageType: row.imageType,
            imageName: row.imageName,
          }),
          bucket: this.storage.bucketName,
          mimeType: guessImageMime(row.imageName),
          size: 0,
        },
      })
      ctx.createdAttachmentIds.push(created.id)
    } catch (err) {
      images.created--
      images.pendingMigration--
      fail("DB_WRITE_FAILED", describeDbError(err))
    }
  }

  private async writeArtifact(jobId: string, name: string, body: unknown) {
    const key = `imports/${jobId}/${name}`
    await this.storage.putObject(
      key,
      Buffer.from(JSON.stringify(body, null, 2)),
      "application/json"
    )
    return key
  }
}

function describeDbError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return `Database error ${err.code}: ${err.message.split("\n").pop()?.trim() ?? err.code}`
  }
  if (err instanceof Error) return err.message.split("\n")[0] ?? "Write failed"
  return "Write failed"
}
