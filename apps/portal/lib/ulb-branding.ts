/**
 * Municipal identity for this portal deployment. Shamli defaults; override per
 * deployment with NEXT_PUBLIC_ULB_* (inlined at build time, so reference each
 * variable literally).
 */
export const ULB = {
  nameEn: process.env.NEXT_PUBLIC_ULB_NAME?.trim() || "Nagar Palika Parishad Shamli",
  nameHi: process.env.NEXT_PUBLIC_ULB_NAME_HI?.trim() || "नगर पालिका परिषद शामली",
  town: process.env.NEXT_PUBLIC_ULB_TOWN?.trim() || "Shamli",
  district: process.env.NEXT_PUBLIC_ULB_DISTRICT?.trim() || "Shamli",
  state: "Uttar Pradesh",
  /** Public website shown on notices / receipts for online payment. */
  websiteHost: process.env.NEXT_PUBLIC_ULB_WEBSITE_HOST?.trim() || "nppshamli.in",
} as const

/** "Shamli · Shamli" style sub-label (town · district). */
export const ULB_LOCATION_LABEL =
  ULB.town === ULB.district ? `${ULB.town} · ${ULB.state}` : `${ULB.town} · ${ULB.district}`
