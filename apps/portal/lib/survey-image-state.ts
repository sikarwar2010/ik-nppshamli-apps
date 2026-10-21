export type SurveyImageStorageStatus = "AVAILABLE" | "PENDING_MIGRATION" | "FAILED"

export type SurveyImageStatusInput = {
  storageStatus?: SurveyImageStorageStatus
  url: string | null
  mimeType: string
}

/** Per-tile load state: the URL whose load failed and whether links were re-signed. */
export type ImageLoadState = { failedUrl: string | null; retried: boolean }

export type ImageTileState =
  | "image"
  | "document"
  | "pending"
  | "failed"
  | "refreshing"
  | "unavailable"

/**
 * What a Property Images tile shows. Only AVAILABLE rows (verified in object
 * storage) render; signed links expire, so one failed load triggers a single
 * re-sign before the tile reports the image as unavailable.
 */
export function imageTileState(
  image: SurveyImageStatusInput,
  load: ImageLoadState
): ImageTileState {
  if (image.storageStatus === "PENDING_MIGRATION") return "pending"
  if (image.storageStatus === "FAILED") return "failed"
  if (!image.url) return "unavailable"
  if (load.failedUrl === image.url) return load.retried ? "unavailable" : "refreshing"
  return image.mimeType.startsWith("image/") ? "image" : "document"
}

export function summarizeSurveyImages(images: SurveyImageStatusInput[]): string {
  if (!images.length) return "No images for this property yet."
  const pending = images.filter((i) => i.storageStatus === "PENDING_MIGRATION").length
  const failed = images.filter((i) => i.storageStatus === "FAILED").length
  return [
    `${images.length} image${images.length === 1 ? "" : "s"}`,
    pending ? `${pending} awaiting storage migration` : null,
    failed ? `${failed} migration failed` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}
