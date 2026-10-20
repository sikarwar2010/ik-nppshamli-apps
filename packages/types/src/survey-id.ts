/**
 * GIS Survey Id format: `{ulbCode}-{ward3}-{parcelN}-{property3}-{gisUseCode}`.
 * Parcel width differs per ULB: Chhata `249044-001-000131-001-R` (6 digits),
 * Shamli `800645-003-00001-001-H` (5 digits). Never re-pad an existing id to a
 * different width — the stored id is the business identifier.
 */

export const SHAMLI_ULB_CODE = "800645"

/** Parcel width used when neither config nor an existing id supplies one. */
export const DEFAULT_PARCEL_DIGITS = 6

export type GisSurveyParts = {
  ulbCode: string
  wardNo: string
  parcelNo: string
  propertyNo: string
  gisUseCode: string
}

export type GenerateSurveyIdInput = {
  ulbCode: string
  wardNo: number | string
  parcelNo: string
  propertyNo: string
  gisUseCode: string
  /** Minimum parcel digits (zero-padded). Defaults to DEFAULT_PARCEL_DIGITS. */
  parcelDigits?: number
}

export type BuildSurveyIdFromRecordInput = {
  surveyId?: string | null
  wardNumber: number
  parcelNo?: string | null
  propertyNo?: string | null
  gisUseCode?: string | null
  ulbCode?: string
  /** Minimum parcel digits. Defaults to the existing id's parcel width. */
  parcelDigits?: number
}

const GIS_SURVEY_ID_PATTERN =
  /^(\d+)-(\d{3})-(\d+)-(\d+)-([A-Za-z])$/

export function parseGisSurveyId(
  surveyId?: string | null
): GisSurveyParts | null {
  if (!surveyId) return null
  const match = surveyId.trim().match(GIS_SURVEY_ID_PATTERN)
  if (
    !match?.[1] ||
    !match[2] ||
    !match[3] ||
    !match[4] ||
    !match[5]
  ) {
    return null
  }
  return {
    ulbCode: match[1],
    wardNo: match[2],
    parcelNo: match[3],
    propertyNo: match[4],
    gisUseCode: match[5].toUpperCase(),
  }
}

/** Parcel width used by an existing GIS id (e.g. 5 for `800645-003-00001-001-H`). */
export function parcelDigitsFromSurveyId(
  surveyId?: string | null
): number | null {
  return parseGisSurveyId(surveyId)?.parcelNo.length ?? null
}

export function normalizeWardCode(wardNo: number | string): string {
  const digits = String(wardNo).replace(/\D/g, "")
  if (!digits) {
    throw new Error("Ward number is required")
  }
  return digits.padStart(3, "0")
}

export function normalizeParcelNo(
  value: string,
  minDigits: number = DEFAULT_PARCEL_DIGITS
): string {
  const digits = value.replace(/\D/g, "")
  if (!digits) {
    throw new Error("Parcel number is required")
  }
  return digits.padStart(Math.max(minDigits, digits.length), "0")
}

export function normalizePropertyNo(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (!digits) {
    throw new Error("Property number is required")
  }
  return digits.padStart(Math.max(3, digits.length), "0")
}

export function normalizeGisUseCode(value: string): string {
  const letter = value.trim().replace(/[^A-Za-z]/g, "")
  if (!letter) {
    throw new Error("GIS use code is required")
  }
  return letter.charAt(0).toUpperCase()
}

export function generateSurveyId(input: GenerateSurveyIdInput): string {
  const ulbCode = input.ulbCode.trim()
  const wardCode = normalizeWardCode(input.wardNo)
  const parcelNo = normalizeParcelNo(input.parcelNo, input.parcelDigits)
  const propertyNo = normalizePropertyNo(input.propertyNo)
  const gisUseCode = normalizeGisUseCode(input.gisUseCode)
  return `${ulbCode}-${wardCode}-${parcelNo}-${propertyNo}-${gisUseCode}`
}

export function buildSurveyIdFromRecord(
  input: BuildSurveyIdFromRecordInput
): string {
  const parsed = input.surveyId ? parseGisSurveyId(input.surveyId) : null
  const ulbCode = input.ulbCode ?? parsed?.ulbCode ?? SHAMLI_ULB_CODE
  const parcelDigits =
    input.parcelDigits ?? parsed?.parcelNo.length ?? DEFAULT_PARCEL_DIGITS
  const parcelNo = normalizeParcelNo(
    input.parcelNo ?? parsed?.parcelNo ?? "",
    parcelDigits
  )
  const propertyNo = normalizePropertyNo(
    input.propertyNo ?? parsed?.propertyNo ?? ""
  )
  const gisUseCode = normalizeGisUseCode(
    input.gisUseCode ?? parsed?.gisUseCode ?? ""
  )
  return generateSurveyId({
    ulbCode,
    wardNo: input.wardNumber,
    parcelNo,
    propertyNo,
    gisUseCode,
    parcelDigits,
  })
}

/**
 * Replace only a placeholder `000` ward segment, keeping ULB, parcel, unit and
 * use code exactly as stored. Returns the input unchanged for anything else
 * (canonical ids, non-GIS ids like `117` or `TEMP-MOBILE-…`).
 */
export function replacePlaceholderWardSegment(
  surveyId: string,
  wardNumber: number
): string {
  const parsed = parseGisSurveyId(surveyId)
  if (!parsed || parsed.wardNo !== "000" || !(wardNumber > 0)) {
    return surveyId
  }
  return `${parsed.ulbCode}-${normalizeWardCode(wardNumber)}-${parsed.parcelNo}-${parsed.propertyNo}-${parsed.gisUseCode}`
}

/** Parcel segment from GIS Survey Id (import helper). */
export function parcelFromSurveyId(surveyId: string): string | null {
  return parseGisSurveyId(surveyId)?.parcelNo ?? null
}

/** Property segment from GIS Survey Id (import helper). */
export function propertyFromSurveyId(surveyId: string): string | null {
  return parseGisSurveyId(surveyId)?.propertyNo ?? null
}

/** Ward number from GIS Survey Id segment. Returns null for placeholder `000`. */
export function wardNumberFromSurveyId(surveyId: string): number | null {
  const parsed = parseGisSurveyId(surveyId)
  if (!parsed) return null
  const n = Number(parsed.wardNo)
  if (!Number.isFinite(n) || n === 0) return null
  return n
}

/** Resolve canonical survey id for Excel import (ward from file, not placeholder segment). */
export function resolveImportSurveyId(
  rawSurveyId: string,
  wardNumber: number,
  parcelNo: string,
  propertyNo: string,
  ulbCode: string = SHAMLI_ULB_CODE
): string {
  const parsed = parseGisSurveyId(rawSurveyId)
  return buildSurveyIdFromRecord({
    surveyId: rawSurveyId,
    wardNumber,
    parcelNo,
    propertyNo,
    // Invalid / truncated Excel Survey Ids still need a letter so each row can import.
    gisUseCode: parsed?.gisUseCode ?? "R",
    ulbCode,
  })
}

/**
 * Excel Parcel No is source of truth for import identity.
 * Survey Id parcel is used only when the Excel cell is empty.
 * (Preferring the Id caused duplicate Survey Ids with different parcels to collapse.)
 * Pads only up to the Survey Id's own parcel width, so `00001` stays `00001`
 * for 5-digit ULBs instead of becoming `000001`.
 */
export function normalizeParcelNoFromExcel(
  excelValue: string,
  surveyId: string
): string | null {
  const trimmed = excelValue.trim()
  if (trimmed) {
    const digits = trimmed.replace(/\D/g, "")
    if (!digits) return trimmed
    const width = parcelDigitsFromSurveyId(surveyId) ?? DEFAULT_PARCEL_DIGITS
    return digits.padStart(Math.max(width, digits.length), "0")
  }
  return parcelFromSurveyId(surveyId)
}

/**
 * Excel Property / Unit No is source of truth for import identity.
 * Survey Id unit is used only when the Excel cell is empty.
 */
export function normalizePropertyNoFromExcel(
  excelValue: string,
  surveyId: string
): string | null {
  const trimmed = excelValue.trim()
  if (trimmed) {
    const digits = trimmed.replace(/\D/g, "")
    if (!digits) return trimmed
    return digits.padStart(Math.max(3, digits.length), "0")
  }
  return propertyFromSurveyId(surveyId)
}

/**
 * Prefer stored parcel; fall back to Survey Id segment. Numeric values are
 * padded only up to the Survey Id's parcel width; values without a GIS id are
 * shown exactly as stored.
 */
export function formatParcelNo(
  parcelNo: string | null | undefined,
  surveyId?: string | null
): string {
  const raw = parcelNo?.trim() ?? ""
  if (raw) {
    const width = parcelDigitsFromSurveyId(surveyId)
    if (width != null && /^\d+$/.test(raw)) return raw.padStart(width, "0")
    return raw
  }
  const fromId = surveyId ? parcelFromSurveyId(surveyId) : null
  if (fromId) return fromId
  return "—"
}

/** Prefer stored property/unit; fall back to Survey Id segment. */
export function formatPropertyNo(
  propertyNo: string | null | undefined,
  surveyId?: string | null
): string {
  const raw = propertyNo?.trim() ?? ""
  if (raw) {
    if (/^\d+$/.test(raw)) return raw.padStart(3, "0")
    return raw
  }
  const fromId = surveyId ? propertyFromSurveyId(surveyId) : null
  if (fromId) return fromId
  return "—"
}
