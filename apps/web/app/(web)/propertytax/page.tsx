import PropertyTax from "@/components/propertytax/page"
import type { Metadata } from "next"
import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Online House Tax Payment",
  description:
    `Search property records, review house tax dues, and pay online for ${site.identity.nameEn}, ${site.identity.district}, ${site.identity.state}.`,
}

export default function PropertyTaxPage() {
  return (
    <div>
      <PropertyTax />
    </div>
  )
}
