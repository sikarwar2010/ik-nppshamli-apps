import variant from "@site/variant"
import type { Metadata } from "next"

import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Citizen services",
  description: `Online services and official e-service portals for citizens of ${site.identity.nameEn}.`,
  alternates: { canonical: "/services" },
}

export default function Page() {
  return <variant.Services />
}
