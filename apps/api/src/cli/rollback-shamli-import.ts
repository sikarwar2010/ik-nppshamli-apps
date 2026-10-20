/**
 * Roll back one Shamli workbook import using the artefacts it wrote to storage
 * (imports/<jobId>/pre-import-snapshot.json and import-result.json).
 *
 *   node dist/cli/rollback-shamli-import.js --job <importJobId>                 # plan only
 *   node dist/cli/rollback-shamli-import.js --job <id> --actor <email> --confirm
 *
 * - Surveys created by the job are soft-deleted (status DELETED), never hard-deleted.
 * - Surveys updated by the job are restored to their snapshot values + floors.
 * - Image rows the job added to pre-existing surveys are removed (their stored
 *   objects are kept; delete them separately if required).
 * Refuses when a record was edited after the import unless --force is given.
 * For a full restore use the pg_dump taken before the import (docs/shamli).
 */
import { Prisma, type Survey, type SurveyFloor } from "@prisma/client"

import { AuditService } from "../audit/audit.service"
import { PrismaService } from "../prisma/prisma.service"
import { StorageService } from "../storage/storage.service"
import { cliArgs, resolveActor, runCli, withAppContext } from "./cli-support"

const USAGE =
  "Usage: node dist/cli/rollback-shamli-import.js --job <importJobId> [--actor <email> --confirm] [--force]"

type Snapshot = { surveys: Array<Survey & { floors: SurveyFloor[] }> }
type Result = { createdSurveyIds: string[]; updatedSurveyIds: string[]; createdAttachmentIds: string[] }

/** Scalar survey columns restored from the snapshot (identity/ownership fields excluded). */
const RESTORE_EXCLUDE = new Set(["id", "createdAt", "createdById", "floors", "attachments"])

function restoreData(row: Record<string, unknown>): Prisma.SurveyUncheckedUpdateInput {
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (RESTORE_EXCLUDE.has(k)) continue
    if (k === "sourceExtras") data[k] = v ?? Prisma.DbNull
    else if (["surveyedAt", "updatedAt", "deletedAt"].includes(k)) data[k] = v ? new Date(v as string) : null
    else data[k] = v
  }
  return data as Prisma.SurveyUncheckedUpdateInput
}

runCli("rollback-shamli-import", async () => {
  const args = cliArgs(
    {
      job: { type: "string" },
      actor: { type: "string" },
      confirm: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    USAGE
  )
  if (!args.job) {
    console.error(USAGE)
    return 2
  }
  return withAppContext(async (app) => {
    const prisma = app.get(PrismaService)
    const storage = app.get(StorageService)
    const audit = app.get(AuditService)
    const jobId = String(args.job)
    const job = await prisma.importJob.findUnique({ where: { id: jobId } })
    if (!job?.completedAt) throw new Error(`Import job ${jobId} not found or not finished`)

    const snapshot = JSON.parse((await storage.getObject(`imports/${jobId}/pre-import-snapshot.json`)).toString("utf8")) as Snapshot
    const result = JSON.parse((await storage.getObject(`imports/${jobId}/import-result.json`)).toString("utf8")) as Result
    const before = new Map(snapshot.surveys.map((s) => [s.id, s]))

    const touched = [...result.createdSurveyIds, ...result.updatedSurveyIds]
    const editedLater = await prisma.survey.findMany({
      where: { id: { in: touched }, updatedAt: { gt: new Date(job.completedAt.getTime() + 60_000) } },
      select: { surveyId: true, updatedAt: true },
    })
    const addedOnExistingCount = await prisma.surveyAttachment.count({
      where: { id: { in: result.createdAttachmentIds }, surveyId: { notIn: result.createdSurveyIds } },
    })
    const plan = {
      job: { id: job.id, fileName: job.fileName, completedAt: job.completedAt },
      softDeleteCreatedSurveys: result.createdSurveyIds.length,
      imageRowsHiddenWithThoseSurveys: result.createdAttachmentIds.length - addedOnExistingCount,
      restoreUpdatedSurveys: result.updatedSurveyIds.length,
      removeAddedImageRowsOnExistingSurveys: addedOnExistingCount,
      editedAfterImport: editedLater.map((e) => e.surveyId),
    }
    console.log(JSON.stringify(plan, null, 2))
    if (editedLater.length > 0 && !args.force) {
      console.error(`${editedLater.length} record(s) were edited after the import. Re-run with --force to overwrite those edits.`)
      return 1
    }
    if (!args.confirm) {
      console.log("Plan only. Re-run with --actor <email> --confirm to apply.")
      return 0
    }
    const actor = await resolveActor(app, args.actor ? String(args.actor) : undefined)

    await prisma.$transaction(
      async (tx) => {
        const now = new Date()
        if (result.createdSurveyIds.length) {
          await tx.survey.updateMany({
            where: { id: { in: result.createdSurveyIds } },
            data: { status: "DELETED", deletedAt: now, updatedById: actor.id },
          })
        }
        const createdSet = new Set(result.createdSurveyIds)
        const addedOnExisting = await tx.surveyAttachment.findMany({
          where: { id: { in: result.createdAttachmentIds }, surveyId: { notIn: [...createdSet] } },
          select: { id: true },
        })
        if (addedOnExisting.length) {
          await tx.surveyAttachment.deleteMany({ where: { id: { in: addedOnExisting.map((a) => a.id) } } })
        }
        for (const id of result.updatedSurveyIds) {
          const row = before.get(id)
          if (!row) continue
          await tx.surveyFloor.deleteMany({ where: { surveyId: id } })
          await tx.survey.update({
            where: { id },
            data: {
              ...restoreData(row as unknown as Record<string, unknown>),
              floors: {
                create: row.floors.map((f) => ({
                  floorLabel: f.floorLabel,
                  areaSqFt: f.areaSqFt,
                  areaSqMeter: f.areaSqMeter,
                  usageType: f.usageType,
                  usageFactor: f.usageFactor,
                  buildingType: f.buildingType,
                  sortOrder: f.sortOrder,
                  rawSegment: f.rawSegment,
                })),
              },
            },
          })
        }
      },
      { timeout: 120_000 }
    )
    await audit.log({
      action: "IMPORT_ROLLED_BACK",
      entity: "ImportJob",
      entityId: job.id,
      actorId: actor.id,
      newValue: plan as unknown as Prisma.InputJsonValue,
    })
    console.log("Rollback applied.")
    return 0
  })
})
