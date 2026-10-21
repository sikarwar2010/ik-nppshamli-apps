import type { Metadata } from "next"

import { SiteNotices } from "@/components/site/SitePages"
import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Notices & announcements",
  description: `Official notices, announcements and tenders published by ${site.identity.nameEn}.`,
  alternates: { canonical: "/notices" },
}

export default function Page() {
  return <SiteNotices />
}
