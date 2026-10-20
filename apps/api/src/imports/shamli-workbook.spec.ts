import ExcelJS from "exceljs"

import {
  IMAGE_HEADERS,
  SURVEY_HEADERS,
  buildPropertyImageKey,
  isShamliSurveyHeaderRow,
  parseShamliWorkbook,
  parseSurveyDate,
  wardNumberFromLabel,
} from "./shamli-workbook"

type SurveyRow = Partial<Record<(typeof SURVEY_HEADERS)[number], unknown>>

const FLOORS =
  "First Floor - 722 SqFt - 67.0760 SqMt || Usage Type - Residential || Usage Factor - Self Occupied || Usage Type - Pakka Building with R.C.C Roof or R.B. Roof,\n" +
  "Ground Floor - 722 SqFt - 67.0760 SqMt || Usage Type - Residential || Usage Factor - Self Occupied || Usage Type - Pakka Building with R.C.C Roof or R.B. Roof"

function baseRow(overrides: SurveyRow = {}): SurveyRow {
  return {
    SN: 1,
    Status: "Submitted",
    "Surveyor Name": "Sharaf",
    "Assessment Year": "Ay 2026 2027",
    "Property Id": "800645-003-00003-001-R",
    "Date of Survey": new Date("2026-10-05T05:03:38.814Z"),
    "Owner Name": "Chanchal Jain",
    "Owner Father Name": "N/A",
    "Mobile No": "0000000000",
    "Ward Name": "3 - Lajpat Rai",
    "Is Slum": "No",
    "Parcel No": "00003",
    "Unit No": "001",
    "old property Number": "03",
    "Constructed Date": "",
    "Respondent Name": "Chanchal Jain",
    "Respondent Relationship": "Sellf",
    City: "Shamali",
    Pincode: "N/A",
    "House No": "03",
    Locality: "Bada Nazar",
    Colony: "Shiv Murti",
    "Tax Rate Zone": "Below 9m",
    "Property Ownership": "Individual",
    "Property Type": "Residential Self",
    "Property Uses": "Residential",
    Situation: "Interior",
    "Road Type": "Rcc",
    Floors: FLOORS,
    "Plot Area SqFt": 1881,
    "Plinth Area SqFt": "",
    "Total Built Up Area SqFt": 2888,
    "Is Municipal Water Supply": "Yes",
    "Total Water Connection": "",
    "Water Connection Id/Type": "Government Tap",
    "Toilet Type": "Sewer System",
    "Is Municipal Waste Service": "N/A",
    Latitude: 29.448705,
    Longitude: 77.311817,
    ...overrides,
  }
}

function imageRow(
  propertyId: string,
  parcel: string,
  unit: string,
  name: string,
  type = "Front View"
) {
  const url = `https://backend.sdvedutech.in/api/storage/uploads/x/survey/y/${name}`
  return [
    propertyId,
    "Lajpat Rai",
    "3",
    parcel,
    unit,
    type,
    name,
    { text: url, hyperlink: url },
  ]
}

function buildWorkbook(
  surveyRows: SurveyRow[],
  images: unknown[][]
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  const s = wb.addWorksheet("Survey Data")
  s.addRow([...SURVEY_HEADERS])
  for (const row of surveyRows) {
    s.addRow(SURVEY_HEADERS.map((h) => row[h] ?? ""))
  }
  const i = wb.addWorksheet("Parcel Images")
  i.addRow([...IMAGE_HEADERS])
  for (const row of images) i.addRow(row)
  return wb
}

describe("Shamli workbook parser", () => {
  it("recognizes the Shamli 39-column header row", () => {
    expect(isShamliSurveyHeaderRow([...SURVEY_HEADERS])).toBe(true)
    expect(isShamliSurveyHeaderRow(["SN", "Actions", "Survey Id"])).toBe(false)
  })

  it("preserves identifiers, leading zeros, multiline floors and raw text", () => {
    const parsed = parseShamliWorkbook(buildWorkbook([baseRow()], []), {
      ulbCode: "800645",
    })
    expect(parsed.structuralErrors).toEqual([])
    const row = parsed.surveys[0]!
    expect(row.issues).toEqual([])
    expect(row.data).toMatchObject({
      surveyId: "800645-003-00003-001-R",
      parcelNo: "00003",
      propertyNo: "001",
      oldPropertyNo: "03",
      houseNo: "03",
      mobile: "0000000000",
      ownerFatherName: null,
      pincode: null,
      respondentRelationship: "Sellf",
      city: "Shamali",
      status: "ACTIVE",
      sourceStatus: "Submitted",
      plotAreaSqFt: "1881",
      plinthAreaSqFt: null,
      latitude: "29.448705",
      longitude: "77.311817",
      hasMunicipalWaterSupply: true,
      hasMunicipalWasteService: null,
      totalWaterConnections: null,
      floorsRaw: FLOORS,
    })
    expect(row.data?.surveyedAt?.toISOString()).toBe("2026-10-05T05:03:38.814Z")
    expect(row.floors).toHaveLength(2)
    expect(row.floors[0]).toMatchObject({ floorLabel: "First Floor", areaSqFt: 722 })
    expect(row.values["Owner Father Name"]).toBe("N/A")
    expect(row.values["Constructed Date"]).toBe("")
  })

  it("maps In Progress / Draft to DRAFT and keeps non-GIS ids with a warning", () => {
    const parsed = parseShamliWorkbook(
      buildWorkbook(
        [
          baseRow({ Status: "In Progress", "Property Id": "117", "Parcel No": "00116", "Unit No": "000", "Date of Survey": "" }),
          baseRow({ Status: "Draft", "Property Id": "TEMP-MOBILE-0F9851C3B76E453F", "Parcel No": "N/A", "Unit No": "N/A", Latitude: "", Longitude: "" }),
        ],
        []
      )
    )
    const [inProgress, draft] = parsed.surveys
    expect(inProgress?.data).toMatchObject({ surveyId: "117", status: "DRAFT", sourceStatus: "In Progress", surveyedAt: null, parcelNo: "00116", propertyNo: "000" })
    expect(draft?.data).toMatchObject({ surveyId: "TEMP-MOBILE-0F9851C3B76E453F", status: "DRAFT", parcelNo: null, latitude: null })
    expect(inProgress?.issues.map((i) => i.code)).toEqual(["NON_GIS_PROPERTY_ID"])
  })

  it("reports parcel/unit pairs shared by different Property Ids", () => {
    const parsed = parseShamliWorkbook(
      buildWorkbook(
        [
          baseRow({ "Property Id": "117", "Parcel No": "00116", "Unit No": "000" }),
          baseRow({ "Property Id": "800645-003-00116-000-R", "Parcel No": "00116", "Unit No": "000" }),
        ],
        []
      )
    )
    expect(parsed.duplicateCandidates).toEqual([
      { parcelNo: "00116", unitNo: "000", rows: [2, 3], propertyIds: ["117", "800645-003-00116-000-R"] },
    ])
  })

  it("rejects duplicate Property Ids, bad numbers, unknown status and ward mismatch", () => {
    const parsed = parseShamliWorkbook(
      buildWorkbook(
        [
          baseRow(),
          baseRow({ "Plot Area SqFt": "12x" }),
          baseRow({ "Property Id": "800645-004-00009-001-R", "Parcel No": "00009", Status: "Done" }),
        ],
        []
      )
    )
    const codes = parsed.surveys.map((r) => r.issues.map((i) => i.code))
    expect(codes[0]).toEqual([])
    expect(codes[1]).toEqual(["DUPLICATE_PROPERTY_ID", "INVALID_NUMBER"])
    expect(codes[2]).toEqual(["STATUS_UNKNOWN", "ID_WARD_MISMATCH"])
    expect(parsed.surveys[1]?.data).toBeNull()
  })

  it("flags header mismatches as structural errors", () => {
    const wb = buildWorkbook([baseRow()], [])
    wb.getWorksheet("Survey Data")!.getCell("E1").value = "Survey Id"
    const parsed = parseShamliWorkbook(wb)
    expect(parsed.structuralErrors).toEqual([
      expect.objectContaining({ code: "HEADER_MISMATCH", field: "Property Id" }),
    ])
    expect(parsed.surveys).toEqual([])
  })

  it("links images by Property ID, treating blank and N/A identifiers as equal", () => {
    const parsed = parseShamliWorkbook(
      buildWorkbook(
        [
          baseRow(),
          baseRow({ Status: "Draft", "Property Id": "131", "Parcel No": "N/A", "Unit No": "N/A" }),
        ],
        [
          imageRow("800645-003-00003-001-R", "00003", "001", "a.jpg"),
          imageRow("131", "", "N/A", "b.jpg"),
          imageRow("999", "00009", "001", "c.jpg"),
          imageRow("800645-003-00003-001-R", "00004", "001", "d.jpg", "Side View"),
        ]
      )
    )
    const codes = parsed.images.map((r) => r.issues.map((i) => i.code))
    expect(codes).toEqual([[], [], ["IMAGE_PROPERTY_UNKNOWN"], ["IMAGE_PARCEL_MISMATCH"]])
    expect(parsed.images[0]).toMatchObject({ propertyId: "800645-003-00003-001-R", imageType: "Front View", imageName: "a.jpg", wardNumber: 3 })
  })

  it("builds stable, safe object keys from business identifiers", () => {
    expect(
      buildPropertyImageKey({ ulbCode: "800645", wardNumber: 3, propertyId: "800645-003-00001-001-H", imageType: "Front View", imageName: "faa826d1.jpg" })
    ).toBe("property-images/800645/ward-003/800645-003-00001-001-H/front-view--faa826d1.jpg")
    expect(
      buildPropertyImageKey({ ulbCode: "800645", wardNumber: 3, propertyId: "150/1", imageType: "Side View", imageName: "../x.jpg" })
    ).toBe("property-images/800645/ward-003/150_1/side-view--__x.jpg")
    expect(
      buildPropertyImageKey({ ulbCode: "800645", wardNumber: 3, propertyId: "a..b", imageType: "Front View", imageName: "x..y.jpg" })
    ).toBe("property-images/800645/ward-003/a_b/front-view--x_y.jpg")
  })

  it("parses ward labels and survey dates", () => {
    expect(wardNumberFromLabel("3 - Lajpat Rai")).toBe(3)
    expect(wardNumberFromLabel("Lajpat Rai")).toBeNull()
    expect(parseSurveyDate("05-10-2026").value?.toISOString()).toBe("2026-10-05T00:00:00.000Z")
    expect(parseSurveyDate("31-02-2026").issue).toBeDefined()
    expect(parseSurveyDate("").value).toBeNull()
  })
})
