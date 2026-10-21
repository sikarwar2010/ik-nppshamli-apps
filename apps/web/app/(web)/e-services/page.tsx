import type { Metadata } from "next"

import { SiteServices } from "@/components/site/SitePages"
import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "e-Services",
  description: `Official e-service portals for citizens of ${site.identity.nameEn}.`,
  alternates: { canonical: "/e-services" },
}

export default function Page() {
  return <SiteServices />
}
