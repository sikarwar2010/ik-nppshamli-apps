import { PublicApiError } from "@/lib/public-api"
import { site } from "@/lib/site"

const CITIZEN_MESSAGES: Record<string, string> = {
  PAYMENT_IN_PROGRESS:
    "A payment for this property is already in progress. Please wait a few minutes and try again, or check your payment status if you already paid.",
  ALREADY_PAID_FOR_YEAR: "No payment is currently due for this assessment year.",
  DUES_NOT_PAYABLE:
    `Online payment is not available for this property yet. Please contact ${site.identity.nameEn}.`,
  GATEWAY_CHECKOUT_MISSING:
    "Unable to initiate payment. Please try again.",
  SURVEY_NOT_FOUND: "Property record was not found. Please search again.",
}

/**
 * Map payment-create failures to citizen-safe copy.
 * Never expose gateway internals or raw error codes.
 */
export function citizenPayErrorMessage(error: unknown): string {
  if (error instanceof PublicApiError) {
    const mapped = CITIZEN_MESSAGES[error.code]
    if (mapped) return mapped
    if (error.status >= 400 && error.status < 500 && error.message) {
      // Prefer API human message when it is already citizen-facing
      if (
        !error.message.includes("Atom") &&
        !error.message.includes("PAYMENT_PROVIDER") &&
        !error.message.includes("stack")
      ) {
        return error.message
      }
    }
  }
  if (error instanceof Error) {
    if (
      error.message.includes("Atom") ||
      error.message.includes("gateway") ||
      error.message.includes("checkout")
    ) {
      return "Unable to initiate payment. Please try again."
    }
  }
  return "Unable to initiate payment. Please try again."
}
