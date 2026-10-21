import type { MetadataRoute } from "next"

import { site } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Per-property dues, payment and receipt pages are personal; keep them out of search.
      disallow: ["/api/", "/propertytax/dues/", "/propertytax/pay/", "/propertytax/receipt/", "/propertytax/payment/"],
    },
    sitemap: `${site.origin}/sitemap.xml`,
  }
}
