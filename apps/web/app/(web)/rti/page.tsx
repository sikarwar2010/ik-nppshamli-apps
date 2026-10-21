import type { Metadata } from "next"

import { SiteRti } from "@/components/site/SitePages"
import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Right to Information",
  description: `How to request information from ${site.identity.nameEn} under the RTI Act, 2005.`,
  alternates: { canonical: "/rti" },
}

export default function Page() {
  return <SiteRti />
}
