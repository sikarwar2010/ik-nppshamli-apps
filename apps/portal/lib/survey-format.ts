/**
 * Parcel / property display for GIS Survey Ids (`800645-003-00001-001-H`
 * Shamli, `249044-001-000001-001-R` Chhata). Stored ids are shown as-is.
 */

import {
  SHAMLI_ULB_CODE,
  formatParcelNo as formatParcelNoShared,
  formatPropertyNo as formatPropertyNoShared,
  normalizeParcelNo as normalizeParcelNoStrict,
  parseGisSurveyId as parseGisSurveyIdShared,
  replacePlaceholderWardSegment,
} from "@workspace/types"
import { ULB } from "./ulb-branding"

// NEXT_PUBLIC_* values are inlined at build time (must be referenced literally).
export const ULB_NAME = ULB.nameEn
export const PORTAL_ULB_CODE =
  process.env.NEXT_PUBLIC_ULB_CODE?.trim() || SHAMLI_ULB_CODE
/** Shamli parcels are 5 digits (`00001`); set 6 for Chhata-style ids. */
export const PORTAL_PARCEL_DIGITS =
  Number(process.env.NEXT_PUBLIC_SURVEY_PARCEL_DIGITS) || 5

/** Portal-compatible shape (legacy field names). */
export type GisSurveyParts = {
  ulbCode: string
  wardNo: string
  parcelNo: string
  unitNo: string
  useLetter: string
}

export function parseGisSurveyId(
  surveyId?: string | null
): GisSurveyParts | null {
  const parsed = parseGisSurveyIdShared(surveyId)
  if (!parsed) return null
  return {
    ulbCode: parsed.ulbCode,
    wardNo: parsed.wardNo,
    parcelNo: parsed.parcelNo,
    unitNo: parsed.propertyNo,
    useLetter: parsed.gisUseCode,
  }
}

export {
  buildSurveyIdFromRecord,
  generateSurveyId,
  normalizeGisUseCode,
  normalizeParcelNo,
  normalizePropertyNo,
  normalizeWardCode,
} from "@workspace/types"

/** Safe parcel pad; returns null when input has no digits. */
export function tryNormalizeParcelNo(value: string): string | null {
  try {
    return normalizeParcelNoStrict(value, PORTAL_PARCEL_DIGITS)
  } catch {
    return null
  }
}

/** Prefer exact padded parcel, then exact survey ID, else first hit. */
export function pickBestSurveySearchMatch<
  T extends { id: string; surveyId: string; parcelNo?: string | null },
>(rows: T[], query: string): T | undefined {
  if (!rows.length) return undefined
  const q = query.trim()
  // Width-agnostic: "131" matches "000131" (Chhata) and "00131" (Shamli).
  const parcelKey = (value: string) => {
    const v = value.trim()
    return /^\d+$/.test(v) ? v.replace(/^0+/, "") || "0" : v.toLowerCase()
  }
  const queryKey = parcelKey(q)

  if (queryKey) {
    const exactParcel = rows.find(
      (row) => row.parcelNo != null && parcelKey(row.parcelNo) === queryKey
    )
    if (exactParcel) return exactParcel
  }

  const exactSurveyId = rows.find(
    (row) => row.surveyId.trim().toLowerCase() === q.toLowerCase()
  )
  if (exactSurveyId) return exactSurveyId

  return rows[0]
}

/**
 * Display the stored survey id. Only a legacy placeholder `000` ward segment is
 * substituted; ULB, parcel width and unit are never rebuilt for display.
 */
export function formatSurveyId(input: {
  surveyId: string
  wardNumber: number
  parcelNo?: string | null
  propertyNo?: string | null
}): string {
  return replacePlaceholderWardSegment(input.surveyId, input.wardNumber)
}

export function toNumber(value?: string | number | null): number | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function formatArea(
  sqFt?: string | number | null,
  sqM?: string | number | null
): string {
  const ft = toNumber(sqFt)
  const m = toNumber(sqM)
  if (ft == null && m == null) return "—"
  if (m == null) return String(ft)
  if (ft == null) return `${m} sq m`
  return `${ft} (${m} sq m)`
}

export function floorUsageChecks(input: {
  plotAreaSqFt?: string | number | null
  plinthAreaSqFt?: string | number | null
  totalBuiltUpAreaSqFt?: string | number | null
  floors: Array<{ floorLabel: string; areaSqFt?: string | number | null }>
}): string[] {
  const plot = toNumber(input.plotAreaSqFt)
  const plinth = toNumber(input.plinthAreaSqFt)
  const built = toNumber(input.totalBuiltUpAreaSqFt)
  const checks: string[] = []

  if (plot != null && plot > 0 && built != null && built > plot) {
    checks.push(
      `Total built-up area (${built} sq ft) is high compared to the plot area (${plot} sq ft).`
    )
  }

  for (const floor of input.floors) {
    const area = toNumber(floor.areaSqFt)
    if (area == null) continue
    if (plot != null && plot > 0 && area > plot) {
      checks.push(
        `${floor.floorLabel} area (${area} sq ft) exceeds plot area (${plot} sq ft).`
      )
    } else if (plinth != null && plinth > 0 && area > plinth) {
      checks.push(
        `${floor.floorLabel} area (${area} sq ft) exceeds plinth area (${plinth} sq ft).`
      )
    }
  }

  return checks
}

export function qualityLabel(status: string): string {
  return status.replaceAll("_", " ")
}

export function formatParcelNo(
  parcelNo: string | null | undefined,
  surveyId?: string | null
): string {
  const formatted = formatParcelNoShared(parcelNo, surveyId)
  return formatted === "—" ? "—" : formatted
}

export function formatPropertyNo(
  propertyNo: string | null | undefined,
  surveyId?: string | null
): string {
  const formatted = formatPropertyNoShared(propertyNo, surveyId)
  return formatted === "—" ? "—" : formatted
}
