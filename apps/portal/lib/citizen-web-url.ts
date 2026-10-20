import { ULB } from "@/lib/ulb-branding"
/** Public citizen website base URL (apps/web). Used for staff links to online pay. */
export function getCitizenWebUrl(): string {
  const configured = process.env.NEXT_PUBLIC_CITIZEN_WEB_URL?.trim()
  if (configured) return configured.replace(/\/$/, "")
  return "http://localhost:3001"
}

/**
 * Hostname shown on official demand notices / payment instructions.
 * Falls back to the ULB website host when unset or localhost.
 */
export function getCitizenWebDisplayHost(baseUrl?: string): string {
  const fallback = ULB.websiteHost
  const raw = (baseUrl ?? getCitizenWebUrl()).trim()
  if (!raw) return fallback
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const host = new URL(withProtocol).hostname.toLowerCase()
    if (!host || host === "localhost" || host === "127.0.0.1") return fallback
    return host
  } catch {
    return fallback
  }
}

export function citizenPropertyTaxUrl(surveyId?: string): string {
  const base = getCitizenWebUrl()
  if (surveyId) {
    return `${base}/propertytax/dues/${encodeURIComponent(surveyId)}`
  }
  return `${base}/propertytax`
}
