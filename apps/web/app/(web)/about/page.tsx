import variant from "@site/variant"
import type { Metadata } from "next"

import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "About",
  description: `About ${site.identity.nameEn}: history, key facts and municipal information.`,
  alternates: { canonical: "/about" },
}

export default function Page() {
  return <variant.About />
}
