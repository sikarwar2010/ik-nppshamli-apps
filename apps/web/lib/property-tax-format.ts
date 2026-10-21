import type { PublicPropertyTaxDues } from "@workspace/types"
import { site } from "@/lib/site"

export function formatHouseTaxMoney(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function buildHouseTaxAddress(dues: PublicPropertyTaxDues): string {
  const parts = [
    dues.houseNo,
    dues.streetName,
    dues.locality,
    dues.colony,
    dues.city ?? site.identity.nameEn,
    dues.pincode,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : "—"
}

export function isHouseTaxPayable(dues: PublicPropertyTaxDues): boolean {
  return !dues.paidForAssessmentYear && dues.tax.totalDemand > 0
}
