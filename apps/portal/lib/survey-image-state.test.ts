import assert from "node:assert/strict"
import test from "node:test"

import {
  imageTileState,
  summarizeSurveyImages,
  type SurveyImageStatusInput,
} from "./survey-image-state"

const signed = "/api/v1/files?key=property-images%2Ffront.jpg&exp=1&sig=a"
const resigned = "/api/v1/files?key=property-images%2Ffront.jpg&exp=2&sig=b"

function image(overrides: Partial<SurveyImageStatusInput> = {}): SurveyImageStatusInput {
  return { storageStatus: "AVAILABLE", url: signed, mimeType: "image/jpeg", ...overrides }
}

test("migrated images render from their signed URL", () => {
  assert.equal(imageTileState(image(), { failedUrl: null, retried: false }), "image")
  // Rows created before storageStatus existed are treated as stored.
  assert.equal(imageTileState(image({ storageStatus: undefined }), { failedUrl: null, retried: false }), "image")
})

test("pending and failed migrations never render as images", () => {
  assert.equal(
    imageTileState(image({ storageStatus: "PENDING_MIGRATION", url: null }), { failedUrl: null, retried: false }),
    "pending"
  )
  assert.equal(
    imageTileState(image({ storageStatus: "FAILED", url: null }), { failedUrl: null, retried: false }),
    "failed"
  )
  // Even if a URL were present, a non-AVAILABLE status wins.
  assert.equal(
    imageTileState(image({ storageStatus: "PENDING_MIGRATION" }), { failedUrl: null, retried: false }),
    "pending"
  )
})

test("an expired link is refreshed once, then reported as unavailable", () => {
  // First load error on the original URL: ask for fresh links.
  assert.equal(imageTileState(image(), { failedUrl: signed, retried: false }), "refreshing")
  // Fresh URL arrives: render it.
  assert.equal(imageTileState(image({ url: resigned }), { failedUrl: signed, retried: true }), "image")
  // Fresh URL fails too (e.g. object missing): stop retrying.
  assert.equal(imageTileState(image({ url: resigned }), { failedUrl: resigned, retried: true }), "unavailable")
})

test("available rows without a URL or non-images are handled", () => {
  assert.equal(imageTileState(image({ url: null }), { failedUrl: null, retried: false }), "unavailable")
  assert.equal(
    imageTileState(image({ mimeType: "application/pdf" }), { failedUrl: null, retried: false }),
    "document"
  )
})

test("summary counts pending and failed images separately", () => {
  assert.equal(summarizeSurveyImages([]), "No images for this property yet.")
  assert.equal(summarizeSurveyImages([image()]), "1 image")
  assert.equal(
    summarizeSurveyImages([
      image({ storageStatus: "PENDING_MIGRATION" }),
      image({ storageStatus: "PENDING_MIGRATION" }),
    ]),
    "2 images · 2 awaiting storage migration"
  )
  assert.equal(
    summarizeSurveyImages([image(), image({ storageStatus: "PENDING_MIGRATION" }), image({ storageStatus: "FAILED" })]),
    "3 images · 1 awaiting storage migration · 1 migration failed"
  )
})
