import { SiteFooter } from "@/components/site/SiteFooter"
import { SiteHeader } from "@/components/site/SiteHeader"
import {
  SiteAbout,
  SiteContact,
  SiteGrievance,
  SiteHome,
  SiteServices,
} from "@/components/site/SitePages"

import type { SiteVariant } from "./types"

/** Nagar Palika Parishad Shamli: config-driven pages from sites/shamli.ts. */
const variant: SiteVariant = {
  Header: SiteHeader,
  Footer: SiteFooter,
  Home: SiteHome,
  About: SiteAbout,
  Contact: SiteContact,
  Services: SiteServices,
  Grievance: SiteGrievance,
  Departments: null,
  Schemes: null,
  Staff: null,
  Gallery: null,
  extraPaths: [],
}

export default variant
