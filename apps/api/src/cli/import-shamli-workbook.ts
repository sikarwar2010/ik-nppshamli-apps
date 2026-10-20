/**
 * Import a Shamli survey workbook (Survey Data + Parcel Images) through the
 * same ImportsService pipeline as the portal, with an audited actor.
 *
 *   node dist/cli/import-shamli-workbook.js --file 3-Lajpat-Rai.xlsx --dry-run
 *   node dist/cli/import-shamli-workbook.js --file 3-Lajpat-Rai.xlsx \
 *     --actor admin@example.com [--strategy UPDATE|SKIP|CREATE] [--out reports]
 *
 * Re-running with the same file is safe: unchanged rows are not rewritten and
 * images are matched by (survey, source URL), so nothing is duplicated.
 * A pre-import snapshot is written to storage for rollback
 * (dist/cli/rollback-shamli-import.js).
 */
import { DuplicateStrategy } from "@prisma/client"
import ExcelJS from "exceljs"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"

import { ImportsService } from "../imports/imports.service"
import {
  ShamliImportService,
  type ShamliImportReport,
} from "../imports/shamli-import.service"
import type { WorkbookIssue } from "../imports/shamli-workbook"
import { PrismaService } from "../prisma/prisma.service"
import {
  cliArgs,
  mdTable,
  resolveActor,
  runCli,
  timestamp,
  withAppContext,
  writeReport,
} from "./cli-support"

const USAGE = `Usage: node dist/cli/import-shamli-workbook.js --file <workbook.xlsx> [--dry-run]
       [--actor <staff email>] [--strategy UPDATE|SKIP|CREATE] [--out <dir>]`

function renderMarkdown(
  report: ShamliImportReport,
  issues: WorkbookIssue[],
  jobId?: string
): string {
  const s = report.surveys
  const i = report.images
  return [
    `# Shamli workbook ${report.mode === "preview" ? "dry run" : "import"} — ${report.fileName}`,
    "",
    `Generated ${report.generatedAt}${jobId ? ` · import job \`${jobId}\`` : ""} · duplicate strategy ${report.duplicateStrategy}`,
    "",
    "## Sheets",
    mdTable(["Sheet", "Data rows"], Object.entries(report.sheets).map(([k, v]) => [k, v.rows])),
    "",
    "## Survey Data",
    mdTable(
      ["Total", "Created", "Updated", "Unchanged", "Skipped", "Revived", "Failed", "Rows with warnings"],
      [[s.total, s.created, s.updated, s.unchanged, s.skipped, s.revived, s.failed, s.warningRows]]
    ),
    "",
    "## Parcel Images",
    mdTable(
      ["Total", "Created", "Updated", "Unchanged", "Failed", "Pending MinIO migration"],
      [[i.total, i.created, i.updated, i.unchanged, i.failed, i.pendingMigration]]
    ),
    "",
    "## Issues by code",
    mdTable(["Code", "Count"], Object.entries(report.issues.byCode)),
    "",
    "## Duplicate candidates (same Parcel No + Unit No, different Property Id)",
    report.duplicateCandidates.length
      ? mdTable(
          ["Parcel No", "Unit No", "Excel rows", "Property Ids"],
          report.duplicateCandidates.map((d) => [d.parcelNo, d.unitNo, d.rows.join(", "), d.propertyIds.join(", ")])
        )
      : "None.",
    "",
    "## Conflicts",
    report.conflicts.length
      ? mdTable(["Row", "Property Id", "Message"], report.conflicts.map((c) => [c.rowNumber, c.propertyId, c.message]))
      : "None.",
    "",
    "## Row-level issues",
    issues.length
      ? mdTable(
          ["Sheet", "Row", "Severity", "Code", "Field", "Property Id", "Message"],
          issues.map((x) => [x.sheet, x.rowNumber, x.severity, x.code, x.field ?? "", x.propertyId ?? "", x.message])
        )
      : "None.",
    "",
  ].join("\n")
}

runCli("import-shamli-workbook", async () => {
  const args = cliArgs(
    {
      file: { type: "string" },
      actor: { type: "string" },
      strategy: { type: "string", default: "UPDATE" },
      out: { type: "string", default: "tmp/reports" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    USAGE
  )
  if (!args.file) {
    console.error(USAGE)
    return 2
  }
  const strategy = String(args.strategy).toUpperCase() as DuplicateStrategy
  if (!Object.values(DuplicateStrategy).includes(strategy)) {
    console.error(`--strategy must be one of ${Object.values(DuplicateStrategy).join(", ")}`)
    return 2
  }
  const filePath = path.resolve(String(args.file))
  const buffer = await readFile(filePath)
  const fileName = path.basename(filePath)
  const outDir = path.resolve(String(args.out))

  return withAppContext(async (app) => {
    if (args["dry-run"]) {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
      const { report, issues } = await app.get(ShamliImportService).preview(workbook, fileName, strategy)
      const out = await writeReport(outDir, `import-dry-run-${timestamp()}`, { report, issues }, renderMarkdown(report, issues))
      console.log(JSON.stringify({ surveys: report.surveys, images: report.images, issues: report.issues }, null, 2))
      console.log(`Dry-run report: ${out}`)
      return report.issues.errors > 0 ? 1 : 0
    }

    const actor = await resolveActor(app, args.actor ? String(args.actor) : undefined)
    const imports = app.get(ImportsService)
    const file = {
      originalname: fileName,
      buffer,
      size: (await stat(filePath)).size,
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    } as Express.Multer.File
    const job = await imports.createUpload(file, actor, strategy)
    if (job.status === "FAILED") {
      console.error(`Workbook failed validation (job ${job.id}). See import errors in the portal.`)
      return 1
    }
    const finished = await imports.processJob(job.id)
    const report = finished.report as unknown as ShamliImportReport
    const errors = await app.get(PrismaService).importError.findMany({
      where: { importJobId: job.id },
      orderBy: [{ sheet: "asc" }, { rowNumber: "asc" }],
    })
    const issues: WorkbookIssue[] = errors.map((e) => ({
      sheet: e.sheet ?? "",
      rowNumber: e.rowNumber,
      severity: e.severity === "warning" ? "warning" : "error",
      code: /^\[([A-Z_]+)\]/.exec(e.message)?.[1] ?? "",
      message: e.message.replace(/^\[[A-Z_]+\]\s*/, ""),
      field: e.field ?? undefined,
      propertyId: e.surveyId ?? undefined,
    }))
    const out = await writeReport(
      outDir,
      `import-${job.id}`,
      { job: { ...finished, report: undefined }, report, issues },
      renderMarkdown(report, issues, job.id)
    )
    console.log(JSON.stringify({ jobId: job.id, status: finished.status, surveys: report.surveys, images: report.images, issues: report.issues }, null, 2))
    console.log(`Import report: ${out}`)
    return finished.status === "COMPLETED" ? 0 : 1
  })
})
