import variant from "@site/variant"
import type { Metadata } from "next"

import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Contact us",
  description: `Office contact details of ${site.identity.nameEn}.`,
  alternates: { canonical: "/contact" },
}

export default function Page() {
  return <variant.Contact />
}
