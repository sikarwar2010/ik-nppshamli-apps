/**
 * Shamli survey workbook (e.g. `3-Lajpat-Rai.xlsx`): parsing and validation.
 *
 * Pure functions only (no database) so the API import, the preview endpoint,
 * the CLI importer and the reconciliation report share one interpretation.
 *
 * Preservation rules (documented in docs/shamli/excel-import.md):
 * - Identifiers (Property Id, Parcel No, Unit No, old property Number, House No,
 *   Pincode, Mobile No) are kept as the exact source text — leading zeros stay.
 * - Only an empty cell or the exact token `N/A` maps to NULL in typed columns;
 *   every original cell is also kept verbatim in `sourceExtras.source.values`.
 * - Text is never trimmed, re-cased or spell-corrected.
 * - Excel date-time serials are UTC instants (survey times fall 04:00–14:00 UTC
 *   = 09:30–19:30 IST) and are stored unshifted.
 */
import ExcelJS from "exceljs"
import { parseGisSurveyId } from "@workspace/types"

import { parseFloorsRaw, type ParsedFloor } from "../surveys/floors.util"

export const SHAMLI_PRESET = "shamli-v3-39"
export const SURVEY_SHEET = "Survey Data"
export const IMAGE_SHEET = "Parcel Images"

export const SURVEY_HEADERS = [
  "SN",
  "Status",
  "Surveyor Name",
  "Assessment Year",
  "Property Id",
  "Date of Survey",
  "Owner Name",
  "Owner Father Name",
  "Mobile No",
  "Ward Name",
  "Is Slum",
  "Parcel No",
  "Unit No",
  "old property Number",
  "Constructed Date",
  "Respondent Name",
  "Respondent Relationship",
  "City",
  "Pincode",
  "House No",
  "Locality",
  "Colony",
  "Tax Rate Zone",
  "Property Ownership",
  "Property Type",
  "Property Uses",
  "Situation",
  "Road Type",
  "Floors",
  "Plot Area SqFt",
  "Plinth Area SqFt",
  "Total Built Up Area SqFt",
  "Is Municipal Water Supply",
  "Total Water Connection",
  "Water Connection Id/Type",
  "Toilet Type",
  "Is Municipal Waste Service",
  "Latitude",
  "Longitude",
] as const

export const IMAGE_HEADERS = [
  "Property ID",
  "Ward Name",
  "Ward Number",
  "Parcel No",
  "Unit No",
  "Image Type",
  "Image Name",
  "Image URL",
] as const

export type SurveyHeader = (typeof SURVEY_HEADERS)[number]
export type ImageHeader = (typeof IMAGE_HEADERS)[number]

/** Source status text → portal SurveyStatus. Raw text is kept in `sourceStatus`. */
export const STATUS_MAP: Record<string, "ACTIVE" | "DRAFT"> = {
  Submitted: "ACTIVE",
  "In Progress": "DRAFT",
  Draft: "DRAFT",
}

export type IssueSeverity = "error" | "warning"

export type WorkbookIssue = {
  sheet: string
  rowNumber: number
  severity: IssueSeverity
  code: string
  message: string
  field?: string
  propertyId?: string
}

/** Typed values written to the `survey` table (Decimal columns as strings). */
export type ShamliSurveyData = {
  surveyId: string
  sourceStatus: string | null
  status: "ACTIVE" | "DRAFT"
  surveyorName: string | null
  assessmentYear: string | null
  surveyedAt: Date | null
  ownerName: string | null
  ownerFatherName: string | null
  mobile: string | null
  isSlum: boolean
  parcelNo: string | null
  propertyNo: string | null
  oldPropertyNo: string | null
  constructedDate: string | null
  respondentName: string | null
  respondentRelationship: string | null
  city: string | null
  pincode: string | null
  houseNo: string | null
  locality: string | null
  colony: string | null
  taxRateZone: string | null
  propertyOwnership: string | null
  propertyType: string | null
  propertyUse: string | null
  situation: string | null
  roadType: string | null
  floorsRaw: string | null
  plotAreaSqFt: string | null
  plinthAreaSqFt: string | null
  totalBuiltUpAreaSqFt: string | null
  hasMunicipalWaterSupply: boolean | null
  totalWaterConnections: number | null
  waterConnectionIdType: string | null
  toiletType: string | null
  hasMunicipalWasteService: boolean | null
  latitude: string | null
  longitude: string | null
}

export type ParsedSurveyRow = {
  rowNumber: number
  sn: string
  wardNumber: number | null
  wardLabel: string
  values: Record<SurveyHeader, string>
  data: ShamliSurveyData | null
  floors: ParsedFloor[]
  issues: WorkbookIssue[]
}

export type ParsedImageRow = {
  rowNumber: number
  values: Record<ImageHeader, string>
  propertyId: string
  wardNumber: number | null
  imageType: string
  imageName: string
  sourceUrl: string
  issues: WorkbookIssue[]
}

export type ShamliWorkbookParse = {
  structuralErrors: WorkbookIssue[]
  surveys: ParsedSurveyRow[]
  images: ParsedImageRow[]
  /** Parcel/Unit pairs shared by different Property Ids (merge candidates). */
  duplicateCandidates: Array<{
    parcelNo: string
    unitNo: string
    rows: number[]
    propertyIds: string[]
  }>
  sheetRowCounts: Record<string, number>
}

// ─── Cell text ─────────────────────────────────────────────────

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)

/** Exact source text of a cell (no trimming, no N/A collapsing). */
export function sourceCellText(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text?: unknown }).text ?? "")
            : ""
        )
        .join("")
    }
    if ("text" in obj) return sourceCellText(obj.text)
    if ("hyperlink" in obj) return String(obj.hyperlink ?? "")
    if ("result" in obj) return sourceCellText(obj.result)
    if ("error" in obj) return String(obj.error ?? "")
  }
  return String(value)
}

/** NULL rule for typed columns: empty cell or the exact token `N/A`. */
export function isNullToken(text: string): boolean {
  return text === "" || text === "N/A"
}

function nullable(text: string): string | null {
  return isNullToken(text) ? null : text
}

// ─── Typed parsers (return issues instead of guessing) ─────────

type FieldResult<T> = { value: T | null; issue?: string }

export function parseYesNo(text: string): FieldResult<boolean> {
  if (isNullToken(text)) return { value: null }
  if (text === "Yes") return { value: true }
  if (text === "No") return { value: false }
  return { value: null, issue: `expected Yes / No / N/A, got "${text}"` }
}

/** Non-negative decimal text kept exactly (no rounding) for Decimal columns. */
export function parseDecimalText(
  text: string,
  maxFractionDigits = 4
): FieldResult<string> {
  if (isNullToken(text)) return { value: null }
  const normalized = text.trim()
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return { value: null, issue: `"${text}" is not a number` }
  }
  const fraction = normalized.split(".")[1] ?? ""
  if (fraction.length > maxFractionDigits) {
    return {
      value: null,
      issue: `"${text}" has more than ${maxFractionDigits} decimal places and would be rounded`,
    }
  }
  return { value: normalized }
}

export function parseIntegerText(text: string): FieldResult<number> {
  if (isNullToken(text)) return { value: null }
  if (!/^\d+$/.test(text.trim())) {
    return { value: null, issue: `"${text}" is not a whole number` }
  }
  return { value: Number(text.trim()) }
}

/** Accepts Excel dates (Date / serial number) and dd-mm-yyyy text. */
export function parseSurveyDate(raw: unknown): FieldResult<Date> {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? { value: null, issue: "invalid date" }
      : { value: raw }
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { value: new Date(EXCEL_EPOCH_MS + Math.round(raw * 86_400_000)) }
  }
  const text = sourceCellText(raw)
  if (isNullToken(text)) return { value: null }
  const m = text.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m) {
    const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
    if (d.getUTCDate() === Number(m[1])) return { value: d }
  }
  return { value: null, issue: `"${text}" is not a dd-mm-yyyy date` }
}

/** "3 - Lajpat Rai" → 3 */
export function wardNumberFromLabel(label: string): number | null {
  const m = label.trim().match(/^(\d+)\s*-/)
  if (m) return Number(m[1])
  return /^\d+$/.test(label.trim()) ? Number(label.trim()) : null
}

/** Treat empty and N/A identifiers as equivalent when cross-checking sheets. */
function sameIdentifier(a: string, b: string): boolean {
  return (isNullToken(a) ? "" : a) === (isNullToken(b) ? "" : b)
}

// ─── Workbook ──────────────────────────────────────────────────

function readHeaders(sheet: ExcelJS.Worksheet, count: number): string[] {
  const headerRow = sheet.getRow(1)
  const headers: string[] = []
  for (let col = 1; col <= Math.max(count, sheet.columnCount); col++) {
    headers.push(sourceCellText(headerRow.getCell(col).value).trim())
  }
  return headers
}

/** True when the first sheet looks like the Shamli 39-column survey export. */
export function isShamliSurveyHeaderRow(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()))
  return (
    set.has("Property Id") && set.has("Unit No") && set.has("Surveyor Name")
  )
}

function checkHeaders(
  sheetName: string,
  actual: string[],
  expected: readonly string[]
): WorkbookIssue[] {
  const issues: WorkbookIssue[] = []
  expected.forEach((name, i) => {
    if (actual[i] !== name) {
      issues.push({
        sheet: sheetName,
        rowNumber: 1,
        severity: "error",
        code: "HEADER_MISMATCH",
        field: name,
        message: `Column ${i + 1} must be "${name}" (found "${actual[i] ?? ""}")`,
      })
    }
  })
  const extra = actual.slice(expected.length).filter(Boolean)
  if (extra.length > 0) {
    issues.push({
      sheet: sheetName,
      rowNumber: 1,
      severity: "error",
      code: "UNEXPECTED_COLUMNS",
      message: `Unexpected extra columns: ${extra.join(", ")}`,
    })
  }
  return issues
}

function rowIsBlank(values: string[]): boolean {
  return values.every((v) => v === "")
}

export function parseShamliWorkbook(
  workbook: ExcelJS.Workbook,
  options: { ulbCode?: string } = {}
): ShamliWorkbookParse {
  const structuralErrors: WorkbookIssue[] = []
  const surveySheet = workbook.getWorksheet(SURVEY_SHEET)
  const imageSheet = workbook.getWorksheet(IMAGE_SHEET)
  const sheetRowCounts: Record<string, number> = {}

  if (!surveySheet) {
    structuralErrors.push({
      sheet: SURVEY_SHEET,
      rowNumber: 0,
      severity: "error",
      code: "SHEET_MISSING",
      message: `Workbook must contain a "${SURVEY_SHEET}" sheet`,
    })
  }
  if (!imageSheet) {
    structuralErrors.push({
      sheet: IMAGE_SHEET,
      rowNumber: 0,
      severity: "error",
      code: "SHEET_MISSING",
      message: `Workbook must contain a "${IMAGE_SHEET}" sheet`,
    })
  }
  if (surveySheet) {
    structuralErrors.push(
      ...checkHeaders(
        SURVEY_SHEET,
        readHeaders(surveySheet, SURVEY_HEADERS.length),
        SURVEY_HEADERS
      )
    )
  }
  if (imageSheet) {
    structuralErrors.push(
      ...checkHeaders(
        IMAGE_SHEET,
        readHeaders(imageSheet, IMAGE_HEADERS.length),
        IMAGE_HEADERS
      )
    )
  }
  if (structuralErrors.length > 0 || !surveySheet || !imageSheet) {
    return {
      structuralErrors,
      surveys: [],
      images: [],
      duplicateCandidates: [],
      sheetRowCounts,
    }
  }

  const surveys = parseSurveyRows(surveySheet, options.ulbCode)
  sheetRowCounts[SURVEY_SHEET] = surveys.length
  const images = parseImageRows(imageSheet, surveys)
  sheetRowCounts[IMAGE_SHEET] = images.length

  return {
    structuralErrors,
    surveys,
    images,
    duplicateCandidates: findDuplicateCandidates(surveys),
    sheetRowCounts,
  }
}

function parseSurveyRows(
  sheet: ExcelJS.Worksheet,
  ulbCode?: string
): ParsedSurveyRow[] {
  const rows: ParsedSurveyRow[] = []
  const seenIds = new Map<string, number>()

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const excelRow = sheet.getRow(rowNumber)
    const rawCells = SURVEY_HEADERS.map((_, i) => excelRow.getCell(i + 1).value)
    const texts = rawCells.map(sourceCellText)
    if (rowIsBlank(texts)) continue

    const values = Object.fromEntries(
      SURVEY_HEADERS.map((h, i) => [h, texts[i] ?? ""])
    ) as Record<SurveyHeader, string>
    const raw = (h: SurveyHeader) => rawCells[SURVEY_HEADERS.indexOf(h)]
    const issues: WorkbookIssue[] = []
    const propertyId = values["Property Id"]
    const add = (
      severity: IssueSeverity,
      code: string,
      message: string,
      field?: string
    ) =>
      issues.push({
        sheet: SURVEY_SHEET,
        rowNumber,
        severity,
        code,
        message,
        field,
        propertyId: propertyId || undefined,
      })

    if (isNullToken(propertyId) || propertyId.trim() !== propertyId) {
      add(
        "error",
        "PROPERTY_ID_INVALID",
        `Property Id is required and must not have surrounding spaces (got "${propertyId}")`,
        "Property Id"
      )
    } else if (seenIds.has(propertyId)) {
      add(
        "error",
        "DUPLICATE_PROPERTY_ID",
        `Property Id ${propertyId} already appears on row ${seenIds.get(propertyId)}`,
        "Property Id"
      )
    } else {
      seenIds.set(propertyId, rowNumber)
    }

    const status = STATUS_MAP[values.Status]
    if (!status) {
      add(
        "error",
        "STATUS_UNKNOWN",
        `Status "${values.Status}" is not one of ${Object.keys(STATUS_MAP).join(", ")}`,
        "Status"
      )
    }

    const wardNumber = wardNumberFromLabel(values["Ward Name"])
    if (wardNumber == null) {
      add(
        "error",
        "WARD_UNRESOLVED",
        `Cannot read a ward number from "${values["Ward Name"]}"`,
        "Ward Name"
      )
    }

    const gis = parseGisSurveyId(propertyId)
    if (!gis && !isNullToken(propertyId)) {
      add(
        "warning",
        "NON_GIS_PROPERTY_ID",
        `Property Id "${propertyId}" is not a GIS id; imported unchanged (${values.Status})`,
        "Property Id"
      )
    }
    if (gis) {
      const checks: Array<[string, string, string]> = [
        ["Parcel No", gis.parcelNo, values["Parcel No"]],
        ["Unit No", gis.propertyNo, values["Unit No"]],
      ]
      for (const [field, fromId, fromCell] of checks) {
        if (fromId !== fromCell) {
          add(
            "warning",
            "ID_SEGMENT_MISMATCH",
            `${field} "${fromCell}" differs from Property Id segment "${fromId}"`,
            field
          )
        }
      }
      if (wardNumber != null && Number(gis.wardNo) !== wardNumber) {
        add(
          "error",
          "ID_WARD_MISMATCH",
          `Property Id ward ${gis.wardNo} differs from Ward Name "${values["Ward Name"]}"`,
          "Ward Name"
        )
      }
      if (ulbCode && gis.ulbCode !== ulbCode) {
        add(
          "warning",
          "ID_ULB_MISMATCH",
          `Property Id ULB ${gis.ulbCode} differs from configured ULB_CODE ${ulbCode}`,
          "Property Id"
        )
      }
    }

    const date = parseSurveyDate(raw("Date of Survey"))
    if (date.issue) add("error", "INVALID_DATE", date.issue, "Date of Survey")

    const bools = {
      isSlum: parseYesNo(values["Is Slum"]),
      water: parseYesNo(values["Is Municipal Water Supply"]),
      waste: parseYesNo(values["Is Municipal Waste Service"]),
    }
    if (bools.isSlum.issue) add("error", "INVALID_BOOLEAN", bools.isSlum.issue, "Is Slum")
    if (bools.water.issue)
      add("error", "INVALID_BOOLEAN", bools.water.issue, "Is Municipal Water Supply")
    if (bools.waste.issue)
      add("error", "INVALID_BOOLEAN", bools.waste.issue, "Is Municipal Waste Service")

    const areas = {
      plot: parseDecimalText(values["Plot Area SqFt"]),
      plinth: parseDecimalText(values["Plinth Area SqFt"]),
      built: parseDecimalText(values["Total Built Up Area SqFt"]),
    }
    if (areas.plot.issue) add("error", "INVALID_NUMBER", areas.plot.issue, "Plot Area SqFt")
    if (areas.plinth.issue)
      add("error", "INVALID_NUMBER", areas.plinth.issue, "Plinth Area SqFt")
    if (areas.built.issue)
      add("error", "INVALID_NUMBER", areas.built.issue, "Total Built Up Area SqFt")

    const lat = parseDecimalText(values.Latitude, 7)
    const lng = parseDecimalText(values.Longitude, 7)
    if (lat.issue) add("error", "INVALID_NUMBER", lat.issue, "Latitude")
    if (lng.issue) add("error", "INVALID_NUMBER", lng.issue, "Longitude")
    if (lat.value != null && Math.abs(Number(lat.value)) > 90) {
      add("error", "INVALID_COORDINATE", "Latitude must be between -90 and 90", "Latitude")
    }
    if (lng.value != null && Math.abs(Number(lng.value)) > 180) {
      add("error", "INVALID_COORDINATE", "Longitude must be between -180 and 180", "Longitude")
    }

    const connections = parseIntegerText(values["Total Water Connection"])
    if (connections.issue)
      add("error", "INVALID_NUMBER", connections.issue, "Total Water Connection")

    const floorsRaw = nullable(values.Floors)
    const floors = parseFloorsRaw(floorsRaw)
    floors.forEach((floor, i) => {
      if (floor.areaSqFt == null) {
        add(
          "warning",
          "FLOOR_UNPARSED",
          `Floor segment ${i + 1} has no "… SqFt" area; kept as raw text`,
          "Floors"
        )
      }
    })

    const hasErrors = issues.some((i) => i.severity === "error")
    rows.push({
      rowNumber,
      sn: values.SN,
      wardNumber,
      wardLabel: values["Ward Name"],
      values,
      floors,
      issues,
      data: hasErrors
        ? null
        : {
            surveyId: propertyId,
            sourceStatus: nullable(values.Status),
            status: status!,
            surveyorName: nullable(values["Surveyor Name"]),
            assessmentYear: nullable(values["Assessment Year"]),
            surveyedAt: date.value,
            ownerName: nullable(values["Owner Name"]),
            ownerFatherName: nullable(values["Owner Father Name"]),
            mobile: nullable(values["Mobile No"]),
            isSlum: bools.isSlum.value ?? false,
            parcelNo: nullable(values["Parcel No"]),
            propertyNo: nullable(values["Unit No"]),
            oldPropertyNo: nullable(values["old property Number"]),
            constructedDate: nullable(values["Constructed Date"]),
            respondentName: nullable(values["Respondent Name"]),
            respondentRelationship: nullable(values["Respondent Relationship"]),
            city: nullable(values.City),
            pincode: nullable(values.Pincode),
            houseNo: nullable(values["House No"]),
            locality: nullable(values.Locality),
            colony: nullable(values.Colony),
            taxRateZone: nullable(values["Tax Rate Zone"]),
            propertyOwnership: nullable(values["Property Ownership"]),
            propertyType: nullable(values["Property Type"]),
            propertyUse: nullable(values["Property Uses"]),
            situation: nullable(values.Situation),
            roadType: nullable(values["Road Type"]),
            floorsRaw,
            plotAreaSqFt: areas.plot.value,
            plinthAreaSqFt: areas.plinth.value,
            totalBuiltUpAreaSqFt: areas.built.value,
            hasMunicipalWaterSupply: bools.water.value,
            totalWaterConnections: connections.value,
            waterConnectionIdType: nullable(values["Water Connection Id/Type"]),
            toiletType: nullable(values["Toilet Type"]),
            hasMunicipalWasteService: bools.waste.value,
            latitude: lat.value,
            longitude: lng.value,
          },
    })
  }
  return rows
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i

function tryParseUrl(text: string): URL | null {
  try {
    return new URL(text)
  } catch {
    return null
  }
}

function parseImageRows(
  sheet: ExcelJS.Worksheet,
  surveys: ParsedSurveyRow[]
): ParsedImageRow[] {
  const byPropertyId = new Map(
    surveys.map((s) => [s.values["Property Id"], s] as const)
  )
  const seenUrls = new Map<string, number>()
  const rows: ParsedImageRow[] = []

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const excelRow = sheet.getRow(rowNumber)
    const texts = IMAGE_HEADERS.map((_, i) =>
      sourceCellText(excelRow.getCell(i + 1).value)
    )
    if (rowIsBlank(texts)) continue
    const values = Object.fromEntries(
      IMAGE_HEADERS.map((h, i) => [h, texts[i] ?? ""])
    ) as Record<ImageHeader, string>
    const propertyId = values["Property ID"]
    const issues: WorkbookIssue[] = []
    const add = (
      severity: IssueSeverity,
      code: string,
      message: string,
      field?: string
    ) =>
      issues.push({
        sheet: IMAGE_SHEET,
        rowNumber,
        severity,
        code,
        message,
        field,
        propertyId: propertyId || undefined,
      })

    const survey = byPropertyId.get(propertyId)
    if (!survey) {
      add(
        "error",
        "IMAGE_PROPERTY_UNKNOWN",
        `Property ID "${propertyId}" is not in the "${SURVEY_SHEET}" sheet`,
        "Property ID"
      )
    } else {
      if (!sameIdentifier(survey.values["Parcel No"], values["Parcel No"])) {
        add(
          "warning",
          "IMAGE_PARCEL_MISMATCH",
          `Parcel No "${values["Parcel No"]}" differs from survey row ${survey.rowNumber} ("${survey.values["Parcel No"]}")`,
          "Parcel No"
        )
      }
      if (!sameIdentifier(survey.values["Unit No"], values["Unit No"])) {
        add(
          "warning",
          "IMAGE_UNIT_MISMATCH",
          `Unit No "${values["Unit No"]}" differs from survey row ${survey.rowNumber} ("${survey.values["Unit No"]}")`,
          "Unit No"
        )
      }
    }

    const wardNumber = /^\d+$/.test(values["Ward Number"].trim())
      ? Number(values["Ward Number"].trim())
      : null
    if (wardNumber == null) {
      add("error", "WARD_UNRESOLVED", `Ward Number "${values["Ward Number"]}" is not a number`, "Ward Number")
    } else if (survey && survey.wardNumber != null && survey.wardNumber !== wardNumber) {
      add(
        "error",
        "IMAGE_WARD_MISMATCH",
        `Ward Number ${wardNumber} differs from the survey ward ${survey.wardNumber}`,
        "Ward Number"
      )
    }

    const sourceUrl = values["Image URL"]
    const url = tryParseUrl(sourceUrl)
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
      add("error", "IMAGE_URL_INVALID", `Image URL "${sourceUrl}" is not an http(s) URL`, "Image URL")
    } else if (seenUrls.has(sourceUrl)) {
      add(
        "error",
        "DUPLICATE_IMAGE_URL",
        `Image URL already appears on row ${seenUrls.get(sourceUrl)}`,
        "Image URL"
      )
    } else {
      seenUrls.set(sourceUrl, rowNumber)
      const urlName = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      if (urlName !== values["Image Name"]) {
        add(
          "warning",
          "IMAGE_NAME_MISMATCH",
          `Image Name "${values["Image Name"]}" differs from the URL file name "${urlName}"`,
          "Image Name"
        )
      }
    }
    if (isNullToken(values["Image Type"])) {
      add("error", "IMAGE_TYPE_MISSING", "Image Type is required", "Image Type")
    }
    if (!IMAGE_EXTENSIONS.test(values["Image Name"])) {
      add(
        "warning",
        "IMAGE_EXTENSION",
        `Image Name "${values["Image Name"]}" is not .jpg/.jpeg/.png/.webp; content is verified during migration`,
        "Image Name"
      )
    }

    rows.push({
      rowNumber,
      values,
      propertyId,
      wardNumber,
      imageType: values["Image Type"],
      imageName: values["Image Name"],
      sourceUrl,
      issues,
    })
  }
  return rows
}

function findDuplicateCandidates(surveys: ParsedSurveyRow[]) {
  const groups = new Map<string, ParsedSurveyRow[]>()
  for (const row of surveys) {
    const parcel = row.values["Parcel No"]
    const unit = row.values["Unit No"]
    if (isNullToken(parcel) || isNullToken(unit)) continue
    const key = `${parcel}\u0000${unit}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()]
    .filter((rows) => rows.length > 1)
    .map((rows) => ({
      parcelNo: rows[0]!.values["Parcel No"],
      unitNo: rows[0]!.values["Unit No"],
      rows: rows.map((r) => r.rowNumber),
      propertyIds: rows.map((r) => r.values["Property Id"]),
    }))
}

// ─── Object keys ───────────────────────────────────────────────

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function safeSegment(text: string): string {
  return text
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^\./, "_")
}

/**
 * Stable MinIO key for an imported image, derived from business identifiers so
 * re-runs map to the same object:
 * `property-images/800645/ward-003/800645-003-00001-001-H/front-view--<image>.jpg`
 */
export function buildPropertyImageKey(input: {
  ulbCode: string
  wardNumber: number
  propertyId: string
  imageType: string
  imageName: string
}): string {
  const ward = String(input.wardNumber).padStart(3, "0")
  return [
    "property-images",
    safeSegment(input.ulbCode),
    `ward-${ward}`,
    safeSegment(input.propertyId),
    `${slug(input.imageType) || "image"}--${safeSegment(input.imageName)}`,
  ].join("/")
}

export function guessImageMime(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop()
  if (ext === "png") return "image/png"
  if (ext === "webp") return "image/webp"
  return "image/jpeg"
}

export function issueCounts(issues: WorkbookIssue[]) {
  return {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
  }
}
