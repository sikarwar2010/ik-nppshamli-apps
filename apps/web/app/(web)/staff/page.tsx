import variant from "@site/variant"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Staff",
  description: `Staff — ${site.identity.nameEn}.`,
}

/**
 * Only sites with verified content for this page render it; others show the
 * 404 page. Responses stream behind app/loading.tsx, so Next serves them with
 * <meta name="robots" content="noindex"> (status cannot change mid-stream).
 */
export default function Page() {
  const Content = variant.Staff
  if (!Content) notFound()
  return <Content />
}
