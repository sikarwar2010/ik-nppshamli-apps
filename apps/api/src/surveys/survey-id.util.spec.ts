import {
  buildSurveyIdFromRecord,
  generateSurveyId,
  normalizeGisUseCode,
  normalizeParcelNo,
  normalizePropertyNo,
  normalizeWardCode,
  parseGisSurveyId,
  resolveImportSurveyId,
  formatParcelNo,
  normalizeParcelNoFromExcel,
  wardNumberFromSurveyId,
} from "@workspace/types"

import {
  getExpectedSurveyIdFromRecord,
  resolveSurveyIdentity,
  surveyIdNeedsRepair,
} from "./survey-id.util"

describe("survey-id", () => {
  it("formats GIS survey id with zero-padding (Test 6)", () => {
    expect(
      generateSurveyId({
        ulbCode: "249044",
        wardNo: 1,
        parcelNo: "131",
        propertyNo: "1",
        gisUseCode: "r",
      })
    ).toBe("249044-001-000131-001-R")
  })

  it("normalizes individual components", () => {
    expect(normalizeWardCode(1)).toBe("001")
    expect(normalizeParcelNo("131")).toBe("000131")
    expect(normalizePropertyNo("1")).toBe("001")
    expect(normalizeGisUseCode("c")).toBe("C")
  })

  it("parses and rebuilds survey ids", () => {
    const id = "249044-001-000131-001-R"
    const parsed = parseGisSurveyId(id)
    expect(parsed).toEqual({
      ulbCode: "249044",
      wardNo: "001",
      parcelNo: "000131",
      propertyNo: "001",
      gisUseCode: "R",
    })
    expect(
      buildSurveyIdFromRecord({
        wardNumber: 1,
        parcelNo: "000131",
        propertyNo: "001",
        gisUseCode: "R",
      })
    ).toBe(id)
  })

  it("builds seed-style survey id from components (Test 8)", () => {
    const surveyId = generateSurveyId({
      ulbCode: "249044",
      wardNo: 1,
      parcelNo: "000131",
      propertyNo: "001",
      gisUseCode: "R",
    })
    expect(surveyId).toBe("249044-001-000131-001-R")
  })

  it("treats 000 ward segment as placeholder", () => {
    expect(wardNumberFromSurveyId("249044-000-000232-006-C")).toBeNull()
    expect(wardNumberFromSurveyId("249044-002-000232-006-C")).toBe(2)
  })

  it("resolves import survey id using ward from file not Excel placeholder", () => {
    expect(
      resolveImportSurveyId(
        "249044-000-000232-006-C",
        2,
        "000232",
        "006",
        "249044"
      )
    ).toBe("249044-002-000232-006-C")
    expect(
      resolveImportSurveyId(
        "249044-000-000131-001-R",
        1,
        "000131",
        "001",
        "249044"
      )
    ).toBe("249044-001-000131-001-R")
  })

  it("rebuilds survey id from Excel parcel when Survey Id parcel is wrong/duplicated", () => {
    expect(
      resolveImportSurveyId(
        "249044-002-000362-001-C",
        2,
        "000363",
        "001",
        "249044"
      )
    ).toBe("249044-002-000363-001-C")
  })

  it("defaults GIS letter to R when Survey Id is truncated", () => {
    expect(
      resolveImportSurveyId("249154", 2, "000005", "001", "249044")
    ).toBe("249044-002-000005-001-R")
  })

  it("detects legacy placeholder ward segments that need repair", () => {
    const legacy = {
      surveyId: "249044-000-000179-001-R",
      parcelNo: "000179",
      propertyNo: "001",
    }
    expect(surveyIdNeedsRepair(legacy, 1)).toBe(true)
    expect(getExpectedSurveyIdFromRecord(legacy, 1)).toBe(
      "249044-001-000179-001-R"
    )
    expect(surveyIdNeedsRepair(legacy, 2)).toBe(true)
    expect(getExpectedSurveyIdFromRecord(legacy, 2)).toBe(
      "249044-002-000179-001-R"
    )
  })

  it("leaves already canonical survey ids unchanged", () => {
    const canonical = {
      surveyId: "249044-001-000001-001-R",
      parcelNo: "000001",
      propertyNo: "001",
    }
    expect(surveyIdNeedsRepair(canonical, 1)).toBe(false)
    expect(getExpectedSurveyIdFromRecord(canonical, 1)).toBe(
      "249044-001-000001-001-R"
    )
  })
})

describe("Shamli 5-digit parcel ids (ULB 800645)", () => {
  const shamli = {
    surveyId: "800645-003-00001-001-H",
    parcelNo: "00001",
    propertyNo: "001",
  }

  afterEach(() => {
    delete process.env.ULB_CODE
    delete process.env.SURVEY_PARCEL_DIGITS
  })

  it("never rewrites a canonical id on read, whatever ULB_CODE is set", () => {
    process.env.ULB_CODE = "249044"
    expect(surveyIdNeedsRepair(shamli, 3)).toBe(false)
    expect(getExpectedSurveyIdFromRecord(shamli, 3)).toBe(shamli.surveyId)
  })

  it("leaves non-GIS ids (drafts, manual ids) untouched on read", () => {
    for (const surveyId of ["117", "150/1", "TEMP-MOBILE-0F9851C3B76E453F"]) {
      expect(
        surveyIdNeedsRepair({ surveyId, parcelNo: null, propertyNo: null }, 3)
      ).toBe(false)
    }
  })

  it("repairs only the placeholder ward segment and keeps parcel width", () => {
    const legacy = { ...shamli, surveyId: "800645-000-00001-001-H" }
    expect(getExpectedSurveyIdFromRecord(legacy, 3)).toBe(
      "800645-003-00001-001-H"
    )
  })

  it("preserves leading zeros from Excel at the id's own width", () => {
    expect(normalizeParcelNoFromExcel("00001", shamli.surveyId)).toBe("00001")
    expect(normalizeParcelNoFromExcel("1", shamli.surveyId)).toBe("00001")
    expect(formatParcelNo("00001", shamli.surveyId)).toBe("00001")
    expect(formatParcelNo("00116", "117")).toBe("00116")
  })

  it("keeps the existing id width when an existing survey is re-identified", () => {
    const identity = resolveSurveyIdentity(
      { number: 3 },
      { parcelNo: "00002", propertyNo: "001", gisUseCode: "R" },
      shamli
    )
    expect(identity.surveyId).toBe("800645-003-00002-001-R")
    expect(identity.parcelNo).toBe("00002")
  })

  it("uses SURVEY_PARCEL_DIGITS and ULB_CODE for brand-new ids", () => {
    process.env.ULB_CODE = "800645"
    process.env.SURVEY_PARCEL_DIGITS = "5"
    const identity = resolveSurveyIdentity(
      { number: 3 },
      { parcelNo: "7", propertyNo: "1", gisUseCode: "r" }
    )
    expect(identity.surveyId).toBe("800645-003-00007-001-R")
  })

  it("keeps a non-GIS draft id when no GIS use code is supplied", () => {
    const draft = { surveyId: "117", parcelNo: "00116", propertyNo: "000" }
    const identity = resolveSurveyIdentity(
      { number: 3 },
      { parcelNo: "00116", propertyNo: "000" },
      draft
    )
    expect(identity.surveyId).toBe("117")
    expect(identity.parcelNo).toBe("00116")
  })
})
