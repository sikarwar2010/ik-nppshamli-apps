import { ConflictException } from "@nestjs/common"
import type { Prisma, Ward } from "@prisma/client"
import {
  SHAMLI_ULB_CODE,
  DEFAULT_PARCEL_DIGITS,
  buildSurveyIdFromRecord,
  generateSurveyId,
  normalizeGisUseCode,
  normalizeParcelNo,
  normalizePropertyNo,
  parseGisSurveyId,
  replacePlaceholderWardSegment,
} from "@workspace/types"

export type SurveyIdentityInput = {
  surveyId?: string
  wardId?: string
  parcelNo?: string
  propertyNo?: string
  gisUseCode?: string
}

export type ResolvedSurveyIdentity = {
  parcelNo: string | null
  propertyNo: string | null
  gisUseCode: string
  surveyId: string
  ulbCode: string
}

export function getUlbCode(): string {
  return process.env.ULB_CODE?.trim() || SHAMLI_ULB_CODE
}

/** Minimum parcel digits for new GIS ids (Shamli 5). */
export function getParcelDigits(): number {
  const n = Number(process.env.SURVEY_PARCEL_DIGITS)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : DEFAULT_PARCEL_DIGITS
}

export function resolveSurveyIdentity(
  ward: Pick<Ward, "number">,
  input: SurveyIdentityInput,
  current?: {
    surveyId: string
    parcelNo: string | null
    propertyNo: string | null
  } | null
): ResolvedSurveyIdentity {
  const parsed = current?.surveyId
    ? parseGisSurveyId(current.surveyId)
    : input.surveyId
      ? parseGisSurveyId(input.surveyId)
      : null

  // Imported drafts keep non-GIS ids (`117`, `TEMP-MOBILE-…`) until an editor
  // assigns a GIS use code; regenerating them would invent an identifier.
  if (current && !parsed && !input.gisUseCode?.trim()) {
    return {
      surveyId: current.surveyId,
      parcelNo: input.parcelNo?.trim() || current.parcelNo,
      propertyNo: input.propertyNo?.trim() || current.propertyNo,
      gisUseCode: "",
      ulbCode: getUlbCode(),
    }
  }

  // Existing ids keep their ULB and parcel width; new ids use configuration.
  const ulbCode = parsed && current ? parsed.ulbCode : getUlbCode()
  const parcelDigits =
    parsed && current ? parsed.parcelNo.length : getParcelDigits()
  const parcelRaw =
    input.parcelNo ?? current?.parcelNo ?? parsed?.parcelNo ?? ""
  const propertyRaw =
    input.propertyNo ?? current?.propertyNo ?? parsed?.propertyNo ?? ""
  const gisUseRaw =
    input.gisUseCode ?? parsed?.gisUseCode ?? ""

  const parcelNo = normalizeParcelNo(parcelRaw, parcelDigits)
  const propertyNo = normalizePropertyNo(propertyRaw)
  const gisUseCode = normalizeGisUseCode(gisUseRaw)
  const surveyId = generateSurveyId({
    ulbCode,
    wardNo: ward.number,
    parcelNo,
    propertyNo,
    gisUseCode,
    parcelDigits,
  })

  return { parcelNo, propertyNo, gisUseCode, surveyId, ulbCode }
}

export type SurveyIdRecord = {
  id: string
  surveyId: string
  parcelNo: string | null
  propertyNo: string | null
  deletedAt?: Date | null
}

/**
 * Expected id on read: only a legacy placeholder `000` ward segment is
 * replaced. ULB, parcel width, unit and use code are never rewritten on read —
 * regenerating them corrupted ids from ULBs with a different parcel width.
 */
export function getExpectedSurveyIdFromRecord(
  survey: Pick<SurveyIdRecord, "surveyId" | "parcelNo" | "propertyNo">,
  wardNumber: number
): string {
  return replacePlaceholderWardSegment(survey.surveyId, wardNumber)
}

export function surveyIdNeedsRepair(
  survey: Pick<SurveyIdRecord, "surveyId" | "parcelNo" | "propertyNo">,
  wardNumber: number
): boolean {
  return survey.surveyId !== getExpectedSurveyIdFromRecord(survey, wardNumber)
}

export function verifySurveyIdMatchesRecord(
  surveyId: string,
  wardNumber: number,
  parcelNo: string,
  propertyNo: string,
  gisUseCode: string
): boolean {
  const expected = buildSurveyIdFromRecord({
    surveyId,
    wardNumber,
    parcelNo,
    propertyNo,
    gisUseCode,
    ulbCode: getUlbCode(),
  })
  return expected === surveyId
}


/** Repair legacy Excel placeholder ward segments (e.g. `249044-000-...` → `249044-001-...`). */
export async function repairSurveyIdIfNeeded(
  tx: Prisma.TransactionClient,
  survey: SurveyIdRecord,
  wardNumber: number
): Promise<string> {
  if (!surveyIdNeedsRepair(survey, wardNumber)) {
    return survey.surveyId
  }

  const expected = getExpectedSurveyIdFromRecord(survey, wardNumber)
  const parsed = parseGisSurveyId(expected)
  const clash = await tx.survey.findUnique({ where: { surveyId: expected } })
  if (clash && clash.id !== survey.id && !clash.deletedAt) {
    return survey.surveyId
  }

  await tx.survey.update({
    where: { id: survey.id },
    data: {
      surveyId: expected,
      parcelNo: parsed?.parcelNo ?? survey.parcelNo,
      propertyNo: parsed?.propertyNo ?? survey.propertyNo,
    },
  })

  return expected
}

export async function assertSurveyIdAvailable(
  tx: Prisma.TransactionClient,
  surveyId: string,
  excludeId?: string
): Promise<void> {
  const clash = await tx.survey.findUnique({ where: { surveyId } })
  if (clash && clash.id !== excludeId && !clash.deletedAt) {
    throw new ConflictException({
      code: "SURVEY_EXISTS",
      message:
        "A survey already exists for this ULB, ward, parcel, property and GIS use code.",
    })
  }
}
