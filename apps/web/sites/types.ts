/**
 * Per-municipality website configuration. Each deployment builds exactly one
 * site (NEXT_PUBLIC_SITE_ID), so branding, content and URLs never mix.
 *
 * Content rules (docs/websites/README.md):
 * - Only publish facts with a `source`. Anything not yet confirmed by the
 *   municipality carries `verified: false` and is NOT rendered.
 * - Never invent notices, officials, schemes or contact details.
 */

export type SiteId = "shamli" | "chhata"

export type Source = {
  /** Where the fact comes from (URL or document). */
  source: string
  /** ISO date the source was reviewed. */
  reviewedOn: string
  /** Confirmed by the municipality for publication. */
  verified: boolean
}

export type NavItem = { label: string; labelHi?: string; href: string }

export type ExternalService = {
  id: string
  title: string
  titleHi: string
  description: string
  href: string
  /** Operated by the State/Union government or a third party, not the ULB. */
  operator: string
}

export type DocumentLink = {
  title: string
  category: "Budget" | "Balance Sheet" | "Audit" | "AMRUT / Reforms" | "Plans & Reports" | "e-Patrika" | "Other"
  year?: string
  href: string
}

export type Official = { name: string; designation: string; designationHi?: string } & Source

export type Notice = {
  id: string
  title: string
  publishedOn: string
  href?: string
  summary?: string
} & Source

export type SiteConfig = {
  id: SiteId
  /** Canonical public origin, no trailing slash. */
  origin: string
  identity: {
    nameEn: string
    nameHi: string
    shortName: string
    town: string
    district: string
    state: string
    tagline?: string
    taglineHi?: string
    logo: { src: string; alt: string }
  }
  seo: { title: string; description: string; keywords: string[] }
  contact: {
    addressLines?: string[]
    phones: Array<{ label: string; value: string; href: string }>
    emails: string[]
    mapUrl?: string
  } & Source
  about: {
    introHi: string[]
    introEn: string[]
    facts: Array<{ label: string; value: string }>
  } & Source
  /** Short civic messages published by the municipality (not formal notices). */
  publicMessages: Array<{ text: string } & Source>
  notices: Notice[]
  officials: Official[]
  externalServices: ExternalService[]
  documents: { items: DocumentLink[]; note?: string } & Source
  rti: { guidanceHi: string[]; officerNote: string }
  grievance: { channels: Array<{ title: string; description: string; href?: string }> }
  /** Primary navigation for the config-driven layout. */
  nav: NavItem[]
}
