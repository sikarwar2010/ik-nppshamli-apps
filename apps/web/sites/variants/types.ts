import type { ComponentType } from "react"

/**
 * Site-specific page components. Exactly one variant is bundled per build via
 * the `@site/variant` alias (next.config.ts), so the other municipality's
 * pages, strings and assets never ship.
 */
export type SiteVariant = {
  Header: ComponentType
  Footer: ComponentType
  Home: ComponentType
  About: ComponentType
  Contact: ComponentType
  Services: ComponentType
  Grievance: ComponentType
  /** Pages with content only for some sites; null → 404. */
  Departments: ComponentType | null
  Schemes: ComponentType | null
  Staff: ComponentType | null
  Gallery: ComponentType | null
  /** Paths for sitemap.xml beyond the shared routes. */
  extraPaths: string[]
}
