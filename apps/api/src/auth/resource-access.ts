import { ForbiddenException } from "@nestjs/common"

import type { AuthUser } from "./auth.decorators"
import { assertPermission } from "./auth-permissions"

export type SurveyAccessAction = "read" | "create" | "update" | "delete"

export type PaymentAccessAction =
  | "read"
  | "create"
  | "create_offline"
  | "requery"
  | "refund"

export type FileAccessAction = "read" | "create"

export type SurveyResource = {
  id: string
  wardId: string
  createdById?: string | null
}

export type PaymentResource = {
  id: string
  collectedById?: string | null
  wardId?: string | null
}

export type FileResource = {
  objectKey: string
  surveyId?: string | null
  uploadedById?: string | null
  createdById?: string | null
}

function hasBroadResourceAccess(user: AuthUser): boolean {
  return (
    user.roles.includes("SUPER_ADMIN") ||
    user.roles.includes("DEPARTMENT_ADMIN") ||
    user.roles.includes("CLERK")
  )
}

function isScopedOperator(user: AuthUser): boolean {
  return user.roles.includes("OPERATOR") && !hasBroadResourceAccess(user)
}

function deny(message: string): never {
  throw new ForbiddenException({
    code: "FORBIDDEN",
    message,
  })
}

const SURVEY_ACTION_PERMISSION: Record<SurveyAccessAction, string> = {
  read: "survey:read",
  create: "survey:create",
  update: "survey:update",
  delete: "survey:delete",
}

const PAYMENT_ACTION_PERMISSION: Record<PaymentAccessAction, string> = {
  read: "payment:read",
  create: "payment:create",
  create_offline: "payment:offline:create",
  requery: "payment:requery",
  refund: "refund:create",
}

/** Extract internal survey id from `surveys/{surveyId}/...` object keys. */
export function parseSurveyIdFromObjectKey(objectKey: string): string | null {
  const normalized = objectKey.replaceAll("\\", "/").replace(/^\/+/, "")
  const match = /^surveys\/([^/]+)\//.exec(normalized)
  return match?.[1] ?? null
}

export function assertSurveyAccess(
  user: AuthUser,
  survey: SurveyResource,
  action: SurveyAccessAction
): void {
  assertPermission(user, SURVEY_ACTION_PERMISSION[action])

  if (hasBroadResourceAccess(user)) return

  if (!isScopedOperator(user)) return

  if (action === "read" || action === "create") return

  if (survey.createdById !== user.id) {
    deny("You can only modify surveys you created")
  }
}

export function assertPaymentAccess(
  user: AuthUser,
  payment: PaymentResource,
  action: PaymentAccessAction
): void {
  assertPermission(user, PAYMENT_ACTION_PERMISSION[action])

  if (hasBroadResourceAccess(user)) return

  // Citizen / gateway payments have no staff collector.
  if (!payment.collectedById) return

  if (isScopedOperator(user) && payment.collectedById !== user.id) {
    deny("You can only access payments you collected")
  }
}

export function assertFileAccess(
  user: AuthUser,
  file: FileResource,
  action: FileAccessAction,
  survey?: SurveyResource | null
): void {
  assertPermission(user, action === "read" ? "file:read" : "file:create")

  if (hasBroadResourceAccess(user)) return

  const key = file.objectKey.replaceAll("\\", "/").replace(/^\/+/, "")

  if (key.startsWith("imports/") || key.startsWith("exports/")) {
    if (
      isScopedOperator(user) &&
      file.createdById &&
      file.createdById !== user.id
    ) {
      deny("You can only access your own import or export files")
    }
    return
  }

  // `property-images/` holds imported/migrated survey photos keyed by business
  // id; callers must pass the owning survey (no id is derived from the key).
  if (key.startsWith("surveys/") || key.startsWith("property-images/")) {
    const surveyId = file.surveyId ?? parseSurveyIdFromObjectKey(key)
    if (!surveyId) {
      deny("Invalid survey file reference")
    }
    if (survey) {
      assertSurveyAccess(user, survey, action === "read" ? "read" : "update")
    } else if (
      isScopedOperator(user) &&
      file.uploadedById &&
      file.uploadedById !== user.id
    ) {
      deny("You can only access files you uploaded")
    }
    return
  }

  if (isScopedOperator(user)) {
    deny("You do not have access to this file")
  }
}
