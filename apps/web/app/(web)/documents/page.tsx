import type { Metadata } from "next"

import { SiteDocuments } from "@/components/site/SitePages"
import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Budget, audit & reports",
  description: `Budgets, balance sheets, audit reports and scheme documents of ${site.identity.nameEn}.`,
  alternates: { canonical: "/documents" },
}

export default function Page() {
  return <SiteDocuments />
}
