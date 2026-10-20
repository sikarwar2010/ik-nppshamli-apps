/**
 * Excel export in the Shamli source layout (`Survey Data` 39 columns +
 * `Parcel Images` 8 columns) so exports can be re-imported and compared with
 * the original workbook cell by cell.
 *
 * NULL typed values are written back as the original source token (`N/A` or
 * blank) when the record still carries its import provenance, otherwise as
 * `N/A` for text and blank for numbers/dates — matching the source convention.
 */
import { Prisma } from "@prisma/client"
import ExcelJS from "exceljs"

import {
  IMAGE_HEADERS,
  IMAGE_SHEET,
  STATUS_MAP,
  SURVEY_HEADERS,
  SURVEY_SHEET,
  isNullToken,
  type SurveyHeader,
} from "./shamli-workbook"

export type ShamliExportSurvey = {
  surveyId: string
  status: string
  sourceStatus: string | null
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
  plotAreaSqFt: Prisma.Decimal | null
  plinthAreaSqFt: Prisma.Decimal | null
  totalBuiltUpAreaSqFt: Prisma.Decimal | null
  hasMunicipalWaterSupply: boolean | null
  totalWaterConnections: number | null
  waterConnectionIdType: string | null
  toiletType: string | null
  hasMunicipalWasteService: boolean | null
  latitude: Prisma.Decimal | null
  longitude: Prisma.Decimal | null
  sourceRowNumber: number | null
  sourceExtras: Prisma.JsonValue | null
  ward: { number: number; name: string }
  attachments: Array<{
    imageType: string | null
    originalFileName: string
    sourceUrl: string | null
    sourceRowNumber: number | null
    mimeType: string
  }>
}

const TEXT = "@"
const NUMBER = "0.##"
const DATE = "dd-mm-yyyy"

type Cell = { value: ExcelJS.CellValue; numFmt?: string }

function sourceValues(s: ShamliExportSurvey): Partial<Record<SurveyHeader, string>> {
  const extras = s.sourceExtras
  if (!extras || typeof extras !== "object" || Array.isArray(extras)) return {}
  const source = (extras as Prisma.JsonObject).source
  if (!source || typeof source !== "object" || Array.isArray(source)) return {}
  const values = (source as Prisma.JsonObject).values
  if (!values || typeof values !== "object" || Array.isArray(values)) return {}
  return values as Partial<Record<SurveyHeader, string>>
}

function sourceSn(s: ShamliExportSurvey): string | undefined {
  const extras = s.sourceExtras as Prisma.JsonObject | null
  const source = extras?.source as Prisma.JsonObject | undefined
  return typeof source?.sn === "string" ? source.sn : undefined
}

function textCell(value: string | null, raw: string | undefined, numFmt?: string): Cell {
  if (value != null) return { value, numFmt }
  return { value: raw != null && isNullToken(raw) ? raw : "N/A", numFmt }
}

function blankableText(value: string | null, raw: string | undefined, numFmt?: string): Cell {
  if (value != null) return { value, numFmt }
  return { value: raw != null && isNullToken(raw) ? raw : "", numFmt }
}

function numberCell(value: Prisma.Decimal | number | null, raw: string | undefined): Cell {
  if (value == null) {
    return { value: raw != null && isNullToken(raw) ? raw : "" }
  }
  return { value: Number(value.toString()), numFmt: NUMBER }
}

function yesNo(value: boolean | null, raw: string | undefined): Cell {
  if (value == null) return { value: raw != null && isNullToken(raw) ? raw : "N/A" }
  return { value: value ? "Yes" : "No" }
}

function statusText(s: ShamliExportSurvey): string {
  if (s.sourceStatus && STATUS_MAP[s.sourceStatus] === s.status) return s.sourceStatus
  if (s.status === "ACTIVE") return "Submitted"
  if (s.status === "DRAFT") return "Draft"
  return s.status
}

function wardLabel(s: ShamliExportSurvey, raw: string | undefined): string {
  const fromSource = raw?.match(/^(\d+)\s*-/)
  if (raw && fromSource && Number(fromSource[1]) === s.ward.number) return raw
  return `${s.ward.number} - ${s.ward.name}`
}

export function shamliSurveyCells(s: ShamliExportSurvey, index: number): Record<SurveyHeader, Cell> {
  const raw = sourceValues(s)
  const sn = sourceSn(s)
  return {
    SN: { value: sn && /^\d+$/.test(sn) ? Number(sn) : index + 1, numFmt: NUMBER },
    Status: { value: statusText(s) },
    "Surveyor Name": textCell(s.surveyorName, raw["Surveyor Name"]),
    "Assessment Year": textCell(s.assessmentYear, raw["Assessment Year"]),
    "Property Id": { value: s.surveyId, numFmt: TEXT },
    "Date of Survey": s.surveyedAt
      ? { value: s.surveyedAt, numFmt: DATE }
      : { value: "" },
    "Owner Name": textCell(s.ownerName, raw["Owner Name"]),
    "Owner Father Name": textCell(s.ownerFatherName, raw["Owner Father Name"]),
    "Mobile No": textCell(s.mobile, raw["Mobile No"], TEXT),
    "Ward Name": { value: wardLabel(s, raw["Ward Name"]), numFmt: TEXT },
    "Is Slum": { value: s.isSlum ? "Yes" : "No" },
    "Parcel No": textCell(s.parcelNo, raw["Parcel No"], TEXT),
    "Unit No": textCell(s.propertyNo, raw["Unit No"], TEXT),
    "old property Number": textCell(s.oldPropertyNo, raw["old property Number"], TEXT),
    "Constructed Date": blankableText(s.constructedDate, raw["Constructed Date"]),
    "Respondent Name": textCell(s.respondentName, raw["Respondent Name"]),
    "Respondent Relationship": textCell(s.respondentRelationship, raw["Respondent Relationship"]),
    City: textCell(s.city, raw.City),
    Pincode: textCell(s.pincode, raw.Pincode, TEXT),
    "House No": textCell(s.houseNo, raw["House No"]),
    Locality: textCell(s.locality, raw.Locality),
    Colony: textCell(s.colony, raw.Colony),
    "Tax Rate Zone": textCell(s.taxRateZone, raw["Tax Rate Zone"]),
    "Property Ownership": textCell(s.propertyOwnership, raw["Property Ownership"]),
    "Property Type": textCell(s.propertyType, raw["Property Type"]),
    "Property Uses": textCell(s.propertyUse, raw["Property Uses"]),
    Situation: textCell(s.situation, raw.Situation),
    "Road Type": textCell(s.roadType, raw["Road Type"]),
    Floors: blankableText(s.floorsRaw, raw.Floors),
    "Plot Area SqFt": numberCell(s.plotAreaSqFt, raw["Plot Area SqFt"]),
    "Plinth Area SqFt": numberCell(s.plinthAreaSqFt, raw["Plinth Area SqFt"]),
    "Total Built Up Area SqFt": numberCell(s.totalBuiltUpAreaSqFt, raw["Total Built Up Area SqFt"]),
    "Is Municipal Water Supply": yesNo(s.hasMunicipalWaterSupply, raw["Is Municipal Water Supply"]),
    "Total Water Connection":
      s.totalWaterConnections == null
        ? blankableText(null, raw["Total Water Connection"])
        : { value: s.totalWaterConnections },
    "Water Connection Id/Type": textCell(s.waterConnectionIdType, raw["Water Connection Id/Type"]),
    "Toilet Type": textCell(s.toiletType, raw["Toilet Type"]),
    "Is Municipal Waste Service": yesNo(s.hasMunicipalWasteService, raw["Is Municipal Waste Service"]),
    Latitude: numberCell(s.latitude, raw.Latitude),
    Longitude: numberCell(s.longitude, raw.Longitude),
  }
}

/** "3 - Lajpat Rai" → "Lajpat Rai" (image sheet convention). */
function imageWardName(s: ShamliExportSurvey): string {
  const label = wardLabel(s, sourceValues(s)["Ward Name"])
  return label.replace(/^\d+\s*-\s*/, "")
}

export function buildShamliExportWorkbook(surveys: ShamliExportSurvey[]): ExcelJS.Workbook {
  const ordered = [...surveys].sort(
    (a, b) =>
      (a.sourceRowNumber ?? Number.MAX_SAFE_INTEGER) - (b.sourceRowNumber ?? Number.MAX_SAFE_INTEGER) ||
      a.surveyId.localeCompare(b.surveyId)
  )
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(SURVEY_SHEET)
  sheet.addRow([...SURVEY_HEADERS])
  sheet.getRow(1).font = { bold: true }
  ordered.forEach((survey, index) => {
    const cells = shamliSurveyCells(survey, index)
    const row = sheet.addRow(SURVEY_HEADERS.map((h) => cells[h].value))
    SURVEY_HEADERS.forEach((h, i) => {
      const fmt = cells[h].numFmt
      if (fmt) row.getCell(i + 1).numFmt = fmt
    })
  })

  const images = workbook.addWorksheet(IMAGE_SHEET)
  images.addRow([...IMAGE_HEADERS])
  images.getRow(1).font = { bold: true }
  const imageRows = ordered.flatMap((survey) =>
    survey.attachments
      .filter((a) => a.mimeType.startsWith("image/"))
      .map((a) => ({ survey, a }))
  )
  imageRows.sort(
    (x, y) =>
      (x.a.sourceRowNumber ?? Number.MAX_SAFE_INTEGER) - (y.a.sourceRowNumber ?? Number.MAX_SAFE_INTEGER)
  )
  for (const { survey, a } of imageRows) {
    const url = a.sourceUrl ?? ""
    const row = images.addRow([
      survey.surveyId,
      imageWardName(survey),
      String(survey.ward.number),
      survey.parcelNo ?? "",
      survey.propertyNo ?? "N/A",
      a.imageType ?? "",
      a.originalFileName,
      url ? { text: url, hyperlink: url } : "",
    ])
    for (let col = 1; col <= IMAGE_HEADERS.length; col++) row.getCell(col).numFmt = TEXT
  }
  return workbook
}

export function buildShamliExportFilename(wardNumber?: number): string {
  const date = new Date().toISOString().slice(0, 10)
  return wardNumber != null
    ? `shamli-ward-${String(wardNumber).padStart(2, "0")}-survey-${date}.xlsx`
    : `shamli-survey-${date}.xlsx`
}
