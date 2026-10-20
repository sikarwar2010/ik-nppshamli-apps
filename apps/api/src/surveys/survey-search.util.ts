import type { Prisma } from "@prisma/client"
import { normalizeParcelNo } from "@workspace/types"

import { getParcelDigits } from "./survey-id.util"

/** Build list-search OR clauses (contains + padded parcel / exact survey id). */
export function buildSurveySearchOr(
  search: string
): Prisma.SurveyWhereInput[] {
  const q = search.trim()
  if (!q) return []

  const or: Prisma.SurveyWhereInput[] = [
    { surveyId: { contains: q, mode: "insensitive" } },
    { ownerName: { contains: q, mode: "insensitive" } },
    { ownerFatherName: { contains: q, mode: "insensitive" } },
    { mobile: { contains: q } },
    { parcelNo: { contains: q, mode: "insensitive" } },
    { propertyNo: { contains: q, mode: "insensitive" } },
    { locality: { contains: q, mode: "insensitive" } },
  ]

  if (/^\d[\d\s-]*$/.test(q)) {
    try {
      const paddedParcel = normalizeParcelNo(q, getParcelDigits())
      or.push({ parcelNo: { equals: paddedParcel, mode: "insensitive" } })
    } catch {
      // ignore non-parcel digit noise
    }
  }

  if (q.includes("-")) {
    or.push({ surveyId: { equals: q, mode: "insensitive" } })
  }

  return or
}
