export const IMPORT_STATUSES = [
  "UPLOADED",
  "VALIDATING",
  "READY",
  "PROCESSING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
] as const

export type ImportJobStatus = (typeof IMPORT_STATUSES)[number]

export type DuplicateStrategy = "SKIP" | "UPDATE"

export type ImportErrorRow = {
  id: string
  rowNumber: number
  surveyId: string | null
  field: string | null
  message: string
  severity: string
  sheet?: string | null
}

/** Shamli workbook validation / import report (ImportJob.report). */
export type ShamliImportReport = {
  preset: string
  fileName: string
  mode: "preview" | "import"
  generatedAt: string
  sheets: Record<string, { rows: number }>
  surveys: Record<
    | "total"
    | "created"
    | "updated"
    | "unchanged"
    | "skipped"
    | "revived"
    | "failed"
    | "warningRows",
    number
  >
  images: Record<
    "total" | "created" | "updated" | "unchanged" | "failed" | "pendingMigration",
    number
  >
  issues: { errors: number; warnings: number; byCode: Record<string, number> }
  duplicateCandidates: Array<{
    parcelNo: string
    unitNo: string
    rows: number[]
    propertyIds: string[]
  }>
  conflicts: Array<{ rowNumber: number; propertyId: string; message: string }>
}

export type ImportJob = {
  id: string
  fileName: string
  fileSize: number
  status: ImportJobStatus | string
  mappingPreset: string | null
  duplicateStrategy: DuplicateStrategy | string
  totalRows: number
  processedRows: number
  successRows: number
  failedRows: number
  skippedRows: number
  insertedRows: number
  updatedRows: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  createdBy?: { id: string; name: string; email: string } | null
  errors?: ImportErrorRow[]
  report?: ShamliImportReport | null
}

export type ImportListMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}
