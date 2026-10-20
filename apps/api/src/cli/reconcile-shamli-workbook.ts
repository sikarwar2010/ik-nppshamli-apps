/**
 * Read-only reconciliation of a Shamli workbook against the database, MinIO
 * and the portal's Excel export.
 *
 *   node dist/cli/reconcile-shamli-workbook.js --file 3-Lajpat-Rai.xlsx [--out tmp/reports]
 *
 * Expected values are derived from raw cells with an explicit per-column rule
 * table (independent of the import parser) so a parser bug cannot hide itself.
 * Exit code 0 only when every field, relationship, object and export cell
 * matches.
 */
import { Prisma } from "@prisma/client"
import ExcelJS from "exceljs"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { buildShamliExportWorkbook } from "../imports/shamli-excel-export"
import { PrismaService } from "../prisma/prisma.service"
import { StorageService } from "../storage/storage.service"
import {
  cliArgs,
  mdTable,
  runCli,
  timestamp,
  withAppContext,
  writeReport,
} from "./cli-support"

const USAGE =
  "Usage: node dist/cli/reconcile-shamli-workbook.js --file <workbook.xlsx> [--out <dir>] [--skip-object-hash]"

type Rule =
  | { kind: "text"; field: string }
  | { kind: "exactText"; field: string }
  | { kind: "decimal"; field: string }
  | { kind: "int"; field: string }
  | { kind: "yesNo"; field: string }
  | { kind: "slum" }
  | { kind: "status" }
  | { kind: "date" }
  | { kind: "ward" }
  | { kind: "sn" }

/** Documented transformation for each of the 39 source columns. */
const SURVEY_RULES: Record<string, Rule> = {
  SN: { kind: "sn" },
  Status: { kind: "status" },
  "Surveyor Name": { kind: "text", field: "surveyorName" },
  "Assessment Year": { kind: "text", field: "assessmentYear" },
  "Property Id": { kind: "exactText", field: "surveyId" },
  "Date of Survey": { kind: "date" },
  "Owner Name": { kind: "text", field: "ownerName" },
  "Owner Father Name": { kind: "text", field: "ownerFatherName" },
  "Mobile No": { kind: "text", field: "mobile" },
  "Ward Name": { kind: "ward" },
  "Is Slum": { kind: "slum" },
  "Parcel No": { kind: "text", field: "parcelNo" },
  "Unit No": { kind: "text", field: "propertyNo" },
  "old property Number": { kind: "text", field: "oldPropertyNo" },
  "Constructed Date": { kind: "text", field: "constructedDate" },
  "Respondent Name": { kind: "text", field: "respondentName" },
  "Respondent Relationship": { kind: "text", field: "respondentRelationship" },
  City: { kind: "text", field: "city" },
  Pincode: { kind: "text", field: "pincode" },
  "House No": { kind: "text", field: "houseNo" },
  Locality: { kind: "text", field: "locality" },
  Colony: { kind: "text", field: "colony" },
  "Tax Rate Zone": { kind: "text", field: "taxRateZone" },
  "Property Ownership": { kind: "text", field: "propertyOwnership" },
  "Property Type": { kind: "text", field: "propertyType" },
  "Property Uses": { kind: "text", field: "propertyUse" },
  Situation: { kind: "text", field: "situation" },
  "Road Type": { kind: "text", field: "roadType" },
  Floors: { kind: "text", field: "floorsRaw" },
  "Plot Area SqFt": { kind: "decimal", field: "plotAreaSqFt" },
  "Plinth Area SqFt": { kind: "decimal", field: "plinthAreaSqFt" },
  "Total Built Up Area SqFt": { kind: "decimal", field: "totalBuiltUpAreaSqFt" },
  "Is Municipal Water Supply": { kind: "yesNo", field: "hasMunicipalWaterSupply" },
  "Total Water Connection": { kind: "int", field: "totalWaterConnections" },
  "Water Connection Id/Type": { kind: "text", field: "waterConnectionIdType" },
  "Toilet Type": { kind: "text", field: "toiletType" },
  "Is Municipal Waste Service": { kind: "yesNo", field: "hasMunicipalWasteService" },
  Latitude: { kind: "decimal", field: "latitude" },
  Longitude: { kind: "decimal", field: "longitude" },
}

const STATUS: Record<string, string> = { Submitted: "ACTIVE", "In Progress": "DRAFT", Draft: "DRAFT" }

function text(v: unknown): string {
  if (v == null) return ""
  if (v instanceof Date) return v.toISOString()
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    if (Array.isArray(o.richText)) return o.richText.map((p) => String((p as { text?: string }).text ?? "")).join("")
    if ("text" in o) return text(o.text)
    if ("result" in o) return text(o.result)
  }
  return String(v)
}
const isNull = (t: string) => t === "" || t === "N/A"
const show = (v: unknown) =>
  v == null ? null : v instanceof Date ? v.toISOString() : Prisma.Decimal.isDecimal(v) ? String(v) : v

function sheetRows(sheet: ExcelJS.Worksheet) {
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(text)
  const rows: Array<{ rowNumber: number; raw: Record<string, unknown>; text: Record<string, string> }> = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const raw: Record<string, unknown> = {}
    const t: Record<string, string> = {}
    headers.forEach((h, i) => {
      raw[h] = row.getCell(i + 1).value
      t[h] = text(raw[h])
    })
    if (Object.values(t).every((x) => x === "")) continue
    rows.push({ rowNumber: r, raw, text: t })
  }
  return { headers, rows }
}

type Mismatch = { sheet: string; rowNumber: number; key: string; column: string; expected: unknown; actual: unknown }

function expectedFor(rule: Rule, rawCell: unknown, t: string): { compare: (s: Record<string, unknown>) => [unknown, unknown] } {
  switch (rule.kind) {
    case "sn":
      return { compare: (s) => [t, ((s.sourceExtras as Prisma.JsonObject)?.source as Prisma.JsonObject)?.sn ?? null] }
    case "status":
      return { compare: (s) => [`${t} → ${STATUS[t] ?? "?"}`, `${s.sourceStatus} → ${s.status}`] }
    case "exactText":
      return { compare: (s) => [t, s[rule.field]] }
    case "text":
      return { compare: (s) => [isNull(t) ? null : t, s[rule.field]] }
    case "decimal":
      return {
        compare: (s) => [
          isNull(t) ? null : new Prisma.Decimal(t).toString(),
          s[rule.field] == null ? null : new Prisma.Decimal(s[rule.field] as Prisma.Decimal).toString(),
        ],
      }
    case "int":
      return { compare: (s) => [isNull(t) ? null : Number(t), s[rule.field]] }
    case "yesNo":
      return { compare: (s) => [t === "Yes" ? true : t === "No" ? false : null, s[rule.field]] }
    case "slum":
      return { compare: (s) => [t === "Yes", s.isSlum] }
    case "date":
      return {
        compare: (s) => [
          rawCell instanceof Date ? rawCell.toISOString() : isNull(t) ? null : `unparsed:${t}`,
          s.surveyedAt instanceof Date ? s.surveyedAt.toISOString() : null,
        ],
      }
    case "ward":
      return {
        compare: (s) => [Number(/^(\d+)\s*-/.exec(t)?.[1] ?? NaN), (s.ward as { number: number }).number],
      }
  }
}

function floorSegments(floorsRaw: string): number {
  return floorsRaw.split(",").map((x) => x.trim()).filter(Boolean).length
}

runCli("reconcile-shamli-workbook", async () => {
  const args = cliArgs(
    {
      file: { type: "string" },
      out: { type: "string", default: "tmp/reports" },
      "skip-object-hash": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    USAGE
  )
  if (!args.file) {
    console.error(USAGE)
    return 2
  }
  const filePath = path.resolve(String(args.file))
  const source = new ExcelJS.Workbook()
  await source.xlsx.load((await readFile(filePath)) as unknown as ExcelJS.Buffer)
  const surveySheet = sheetRows(source.getWorksheet("Survey Data")!)
  const imageSheet = sheetRows(source.getWorksheet("Parcel Images")!)

  return withAppContext(async (app) => {
    const prisma = app.get(PrismaService)
    const storage = app.get(StorageService)
    const mismatches: Mismatch[] = []
    const ids = surveySheet.rows.map((r) => r.text["Property Id"]!)
    const wardNumbers = [...new Set(surveySheet.rows.map((r) => Number(/^(\d+)/.exec(r.text["Ward Name"]!)?.[1])))]

    const dbSurveys = await prisma.survey.findMany({
      where: { surveyId: { in: ids } },
      include: { ward: true, floors: true, attachments: true },
    })
    const byId = new Map(dbSurveys.map((s) => [s.surveyId, s]))
    const wardSurveys = await prisma.survey.findMany({
      where: { ward: { number: { in: wardNumbers } }, deletedAt: null, status: { not: "DELETED" } },
      select: { surveyId: true },
    })

    // ── Survey Data: all 39 columns + verbatim snapshot + floors ──
    const columnStats: Record<string, { compared: number; mismatched: number }> = {}
    const missing: Array<{ rowNumber: number; propertyId: string }> = []
    let fieldComparisons = 0
    for (const row of surveySheet.rows) {
      const key = row.text["Property Id"]!
      const s = byId.get(key)
      if (!s) {
        missing.push({ rowNumber: row.rowNumber, propertyId: key })
        continue
      }
      for (const header of surveySheet.headers) {
        const rule = SURVEY_RULES[header]
        if (!rule) {
          mismatches.push({ sheet: "Survey Data", rowNumber: row.rowNumber, key, column: header, expected: "known column", actual: "unmapped column" })
          continue
        }
        const [expected, actual] = expectedFor(rule, row.raw[header], row.text[header]!).compare(s as unknown as Record<string, unknown>)
        columnStats[header] ??= { compared: 0, mismatched: 0 }
        columnStats[header].compared++
        fieldComparisons++
        if (JSON.stringify(show(expected)) !== JSON.stringify(show(actual))) {
          columnStats[header].mismatched++
          mismatches.push({ sheet: "Survey Data", rowNumber: row.rowNumber, key, column: header, expected: show(expected), actual: show(actual) })
        }
        // Verbatim source snapshot for audit.
        const values = ((s.sourceExtras as Prisma.JsonObject)?.source as Prisma.JsonObject)?.values as Record<string, string> | undefined
        if (values?.[header] !== row.text[header]) {
          mismatches.push({ sheet: "Survey Data", rowNumber: row.rowNumber, key, column: `${header} (raw snapshot)`, expected: row.text[header], actual: values?.[header] ?? null })
        }
      }
      if (s.sourceRowNumber !== row.rowNumber) {
        mismatches.push({ sheet: "Survey Data", rowNumber: row.rowNumber, key, column: "sourceRowNumber", expected: row.rowNumber, actual: s.sourceRowNumber })
      }
      const floorsRaw = row.text.Floors!
      const expectedFloors = isNull(floorsRaw) ? 0 : floorSegments(floorsRaw)
      if (s.floors.length !== expectedFloors) {
        mismatches.push({ sheet: "Survey Data", rowNumber: row.rowNumber, key, column: "Floors (structured rows)", expected: expectedFloors, actual: s.floors.length })
      }
    }
    const fileIds = new Set(ids)
    const extraInDb = wardSurveys.filter((w) => !fileIds.has(w.surveyId)).map((w) => w.surveyId)

    // Duplicate candidates (same parcel + unit, different Property Id).
    const pu = new Map<string, string[]>()
    for (const row of surveySheet.rows) {
      const p = row.text["Parcel No"]!
      const u = row.text["Unit No"]!
      if (isNull(p) || isNull(u)) continue
      pu.set(`${p}/${u}`, [...(pu.get(`${p}/${u}`) ?? []), row.text["Property Id"]!])
    }
    const duplicateCandidates = [...pu.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => ({ parcelUnit: k, propertyIds: v }))

    // ── Parcel Images: 8 columns + storage objects ──
    const attachments = await prisma.surveyAttachment.findMany({
      where: { sourceUrl: { in: imageSheet.rows.map((r) => r.text["Image URL"]!) } },
      include: { survey: { include: { ward: true } } },
    })
    const byUrl = new Map(attachments.map((a) => [a.sourceUrl!, a]))
    const imageStatus: Record<string, number> = {}
    const missingImages: Array<{ rowNumber: number; propertyId: string; status: string; reason: string }> = []
    let imageComparisons = 0
    for (const row of imageSheet.rows) {
      const t = row.text
      const key = t["Image URL"]!
      const a = byUrl.get(key)
      if (!a) {
        missingImages.push({ rowNumber: row.rowNumber, propertyId: t["Property ID"]!, status: "NOT_IMPORTED", reason: "No attachment row for this Image URL" })
        continue
      }
      const nullable = (x: string) => (isNull(x) ? null : x)
      const checks: Array<[string, unknown, unknown]> = [
        ["Property ID", t["Property ID"], a.survey.surveyId],
        ["Ward Name", `${t["Ward Number"]} (by number; name "${t["Ward Name"]}")`, `${a.survey.ward.number} (by number; name "${t["Ward Name"]}")`],
        ["Ward Number", Number(t["Ward Number"]), a.survey.ward.number],
        ["Parcel No", nullable(t["Parcel No"]!), a.survey.parcelNo],
        ["Unit No", nullable(t["Unit No"]!), a.survey.propertyNo],
        ["Image Type", t["Image Type"], a.imageType],
        ["Image Name", t["Image Name"], a.originalFileName],
        ["Image URL", t["Image URL"], a.sourceUrl],
      ]
      for (const [column, expected, actual] of checks) {
        imageComparisons++
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          mismatches.push({ sheet: "Parcel Images", rowNumber: row.rowNumber, key, column, expected, actual })
        }
      }
      imageStatus[a.storageStatus] = (imageStatus[a.storageStatus] ?? 0) + 1
      if (a.storageStatus !== "AVAILABLE") {
        missingImages.push({ rowNumber: row.rowNumber, propertyId: t["Property ID"]!, status: a.storageStatus, reason: a.migrationError ?? "Not yet migrated to object storage" })
        continue
      }
      const stat = await storage.statObject(a.objectKey)
      if (!stat) {
        missingImages.push({ rowNumber: row.rowNumber, propertyId: t["Property ID"]!, status: "OBJECT_MISSING", reason: `${a.objectKey} not found in ${storage.bucketName}` })
        continue
      }
      if (stat.size !== a.size || (a.checksumSha256 && stat.metadata.sha256 !== a.checksumSha256)) {
        mismatches.push({ sheet: "Parcel Images", rowNumber: row.rowNumber, key, column: "stored object", expected: { size: a.size, sha256: a.checksumSha256 }, actual: { size: stat.size, sha256: stat.metadata.sha256 } })
      }
      if (!args["skip-object-hash"]) {
        const body = await storage.getObject(a.objectKey)
        const sha = createHash("sha256").update(body).digest("hex")
        if (sha !== a.checksumSha256) {
          mismatches.push({ sheet: "Parcel Images", rowNumber: row.rowNumber, key, column: "object content sha256", expected: a.checksumSha256, actual: sha })
        }
      }
    }

    // ── Export round-trip: portal export vs source workbook, cell by cell ──
    const exportSurveys = dbSurveys.map((s) => ({
      ...s,
      attachments: s.attachments.map((a) => ({ imageType: a.imageType, originalFileName: a.originalFileName, sourceUrl: a.sourceUrl, sourceRowNumber: a.sourceRowNumber, mimeType: a.mimeType })),
    }))
    const exported = new ExcelJS.Workbook()
    await exported.xlsx.load((await buildShamliExportWorkbook(exportSurveys).xlsx.writeBuffer()) as ExcelJS.Buffer)
    const exportMismatches: Mismatch[] = []
    for (const [sheetName, keyColumn, src] of [
      ["Survey Data", "Property Id", surveySheet],
      ["Parcel Images", "Image URL", imageSheet],
    ] as const) {
      const out = sheetRows(exported.getWorksheet(sheetName)!)
      if (JSON.stringify(out.headers) !== JSON.stringify(src.headers)) {
        exportMismatches.push({ sheet: sheetName, rowNumber: 1, key: "headers", column: "*", expected: src.headers, actual: out.headers })
      }
      const outByKey = new Map(out.rows.map((r) => [r.text[keyColumn], r]))
      for (const row of src.rows) {
        const o = outByKey.get(row.text[keyColumn])
        if (!o) {
          exportMismatches.push({ sheet: sheetName, rowNumber: row.rowNumber, key: row.text[keyColumn]!, column: "*", expected: "row", actual: "missing from export" })
          continue
        }
        for (const h of src.headers) {
          if (row.text[h] !== o.text[h]) {
            exportMismatches.push({ sheet: sheetName, rowNumber: row.rowNumber, key: row.text[keyColumn]!, column: h, expected: row.text[h], actual: o.text[h] })
          }
          const srcFmt = source.getWorksheet(sheetName)!.getRow(row.rowNumber).getCell(src.headers.indexOf(h) + 1).type
          const outFmt = exported.getWorksheet(sheetName)!.getRow(o.rowNumber).getCell(out.headers.indexOf(h) + 1).type
          if (srcFmt !== outFmt) {
            exportMismatches.push({ sheet: sheetName, rowNumber: row.rowNumber, key: row.text[keyColumn]!, column: `${h} (cell type)`, expected: srcFmt, actual: outFmt })
          }
        }
      }
    }

    const statusCounts = surveySheet.rows.reduce<Record<string, number>>((m, r) => ((m[r.text.Status!] = (m[r.text.Status!] ?? 0) + 1), m), {})
    const lastJob = await prisma.importJob.findFirst({ where: { fileName: path.basename(filePath) }, orderBy: { createdAt: "desc" } })
    const report = {
      file: path.basename(filePath),
      generatedAt: new Date().toISOString(),
      lastImportJob: lastJob && { id: lastJob.id, status: lastJob.status, inserted: lastJob.insertedRows, updated: lastJob.updatedRows, skipped: lastJob.skippedRows, failed: lastJob.failedRows, report: lastJob.report },
      surveys: {
        sourceRows: surveySheet.rows.length,
        sourceColumns: surveySheet.headers.length,
        statusCounts,
        foundInDb: surveySheet.rows.length - missing.length,
        missingInDb: missing,
        extraInDbSameWard: extraInDb,
        fieldComparisons,
        columnStats,
      },
      images: {
        sourceRows: imageSheet.rows.length,
        sourceColumns: imageSheet.headers.length,
        linked: attachments.length,
        fieldComparisons: imageComparisons,
        storageStatus: imageStatus,
        missingImageFiles: missingImages,
      },
      duplicateCandidates,
      fieldMismatches: mismatches,
      exportRoundTrip: { mismatches: exportMismatches.length, details: exportMismatches.slice(0, 500) },
      result:
        missing.length === 0 && mismatches.length === 0 && exportMismatches.length === 0 && missingImages.length === 0
          ? "MATCH"
          : missing.length === 0 && mismatches.length === 0 && exportMismatches.length === 0
            ? "DATA_MATCH_IMAGES_PENDING"
            : "MISMATCH",
    }

    const md = [
      `# Reconciliation — ${report.file}`,
      "",
      `Generated ${report.generatedAt}. Result: **${report.result}**`,
      "",
      "## Records",
      mdTable(
        ["Sheet", "Source rows", "Columns", "In database", "Missing", "Field comparisons"],
        [
          ["Survey Data", report.surveys.sourceRows, report.surveys.sourceColumns, report.surveys.foundInDb, missing.length, fieldComparisons],
          ["Parcel Images", report.images.sourceRows, report.images.sourceColumns, report.images.linked, imageSheet.rows.length - attachments.length, imageComparisons],
        ]
      ),
      "",
      `Source status counts: ${Object.entries(statusCounts).map(([k, v]) => `${k} ${v}`).join(", ")}`,
      "",
      `Active records in the same ward(s) that are not in this file: ${extraInDb.length}${extraInDb.length ? ` (${extraInDb.slice(0, 20).join(", ")}…)` : ""}`,
      "",
      "## Per-column comparison (Survey Data)",
      mdTable(["Column", "Rule", "Compared", "Mismatched"], Object.entries(columnStats).map(([k, v]) => [k, SURVEY_RULES[k]?.kind, v.compared, v.mismatched])),
      "",
      "## Image storage",
      mdTable(["Status", "Count"], Object.entries(imageStatus)),
      "",
      "## Missing image files",
      missingImages.length ? mdTable(["Row", "Property ID", "Status", "Reason"], missingImages.map((m) => [m.rowNumber, m.propertyId, m.status, m.reason])) : "None.",
      "",
      "## Duplicate candidates",
      duplicateCandidates.length ? mdTable(["Parcel/Unit", "Property Ids"], duplicateCandidates.map((d) => [d.parcelUnit, d.propertyIds.join(", ")])) : "None.",
      "",
      "## Field-level mismatches",
      mismatches.length ? mdTable(["Sheet", "Row", "Key", "Column", "Expected", "Actual"], mismatches.slice(0, 500).map((m) => [m.sheet, m.rowNumber, m.key, m.column, JSON.stringify(m.expected), JSON.stringify(m.actual)])) : "None.",
      "",
      "## Export round-trip (portal export vs source workbook)",
      exportMismatches.length ? mdTable(["Sheet", "Row", "Key", "Column", "Source", "Export"], exportMismatches.slice(0, 200).map((m) => [m.sheet, m.rowNumber, m.key, m.column, JSON.stringify(m.expected), JSON.stringify(m.actual)])) : "All cells, headers and cell types match.",
      "",
    ].join("\n")
    const out = await writeReport(path.resolve(String(args.out)), `reconcile-${timestamp()}`, report, md)
    console.log(JSON.stringify({ result: report.result, surveys: { ...report.surveys, columnStats: undefined }, images: { ...report.images, missingImageFiles: missingImages.length }, fieldMismatches: mismatches.length, exportMismatches: exportMismatches.length, duplicateCandidates: duplicateCandidates.length }, null, 2))
    console.log(`Reconciliation report: ${out}`)
    return report.result === "MATCH" ? 0 : 1
  })
})
