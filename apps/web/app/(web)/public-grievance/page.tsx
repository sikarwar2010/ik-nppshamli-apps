import variant from "@site/variant"
import type { Metadata } from "next"

import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Public grievance",
  description: `How to register a grievance with ${site.identity.nameEn}.`,
  alternates: { canonical: "/public-grievance" },
}

export default function Page() {
  return <variant.Grievance />
}
