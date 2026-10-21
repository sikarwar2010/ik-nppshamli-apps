import assert from "node:assert/strict"
import test from "node:test"

import {
  FLOOR_LABELS,
  OPEN_FLOOR_LABEL,
  composeUsageFromFloors,
  floorLabelsForPropertyUse,
  isCommercialPropertyUse,
  isMixedPropertyUse,
  sqFtToSqM,
  sqMToSqFt,
  validateMixedComposition,
} from "./floors"
import { pickBestSurveySearchMatch } from "./survey-format"

test("floor labels include Open only for Open Land property use", () => {
  assert.equal(
    floorLabelsForPropertyUse("Residential Self").includes(OPEN_FLOOR_LABEL),
    false
  )
  assert.equal(
    floorLabelsForPropertyUse(undefined).includes(OPEN_FLOOR_LABEL),
    false
  )
  assert.equal(
    floorLabelsForPropertyUse("Open Land").includes(OPEN_FLOOR_LABEL),
    true
  )
  assert.equal(
    floorLabelsForPropertyUse("  open land  ").includes(OPEN_FLOOR_LABEL),
    true
  )
  assert.deepEqual(
    floorLabelsForPropertyUse("Open Land").at(-1),
    OPEN_FLOOR_LABEL
  )
  assert.equal(
    floorLabelsForPropertyUse("Open Land").length,
    FLOOR_LABELS.length + 1
  )
})

test("pickBestSurveySearchMatch prefers exact padded parcel over first hit", () => {
  const rows = [
    { id: "a", surveyId: "249044-001-000013-001-R", parcelNo: "000013" },
    { id: "b", surveyId: "249044-001-000131-001-R", parcelNo: "000131" },
  ]
  const match = pickBestSurveySearchMatch(rows, "131")
  assert.equal(match?.id, "b")

  // Shamli 5-digit parcels.
  const shamli = [
    { id: "x", surveyId: "800645-003-00001-001-H", parcelNo: "00001" },
    { id: "y", surveyId: "800645-003-00116-001-R", parcelNo: "00116" },
  ]
  assert.equal(pickBestSurveySearchMatch(shamli, "116")?.id, "y")
  assert.equal(pickBestSurveySearchMatch(shamli, "00116")?.id, "y")
  assert.equal(pickBestSurveySearchMatch(shamli, "800645-003-00001-001-H")?.id, "x")
})

test("isMixedPropertyUse and isCommercialPropertyUse match catalog labels", () => {
  assert.equal(isMixedPropertyUse("Mixed"), true)
  assert.equal(isMixedPropertyUse("mix"), true)
  assert.equal(isMixedPropertyUse("Residential Self"), false)
  assert.equal(isCommercialPropertyUse("Commercial"), true)
  assert.equal(isCommercialPropertyUse("commercial"), true)
  assert.equal(isCommercialPropertyUse("Mixed"), false)
})

test("sqFtToSqM and sqMToSqFt use project precision", () => {
  assert.equal(sqFtToSqM(300), 27.87)
  assert.equal(sqMToSqFt(1), 10.76)
  // Two-decimal rounding prevents a perfect round-trip for all values.
  assert.ok(Math.abs(sqMToSqFt(sqFtToSqM(300)) - 300) <= 0.02)
})

test("composeUsageFromFloors aggregates area and percentages", () => {
  const composition = composeUsageFromFloors([
    { usageType: "Residential", areaSqFt: 180 },
    { usageType: "Commercial", areaSqFt: 120 },
  ])
  assert.equal(composition.totalSqFt, 300)
  assert.equal(composition.distinctUsageCount, 2)
  assert.equal(composition.rows[0]?.usageType, "Residential")
  assert.equal(composition.rows[0]?.percent, 60)
  assert.equal(composition.rows[1]?.usageType, "Commercial")
  assert.equal(composition.rows[1]?.percent, 40)
})

test("validateMixedComposition requires two usage types and area", () => {
  assert.match(validateMixedComposition([]) ?? "", /Add floor records/)
  assert.match(
    validateMixedComposition([
      { usageType: "Residential", areaSqFt: 100 },
      { usageType: "Residential", areaSqFt: 50 },
    ]) ?? "",
    /two different/
  )
  assert.equal(
    validateMixedComposition([
      { usageType: "Residential", areaSqFt: 100 },
      { usageType: "Commercial", areaSqFt: 50 },
    ]),
    null
  )
})
