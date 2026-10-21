import type { MetadataRoute } from "next"

import variant from "@site/variant"

import { site } from "@/lib/site"

const SHARED = ["/", "/about", "/services", "/e-services", "/propertytax", "/notices", "/documents", "/rti", "/public-grievance", "/contact"]

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...SHARED, ...variant.extraPaths]
  return paths.map((path) => ({
    url: `${site.origin}${path}`,
    changeFrequency: path === "/" || path === "/notices" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/propertytax" ? 0.9 : 0.6,
  }))
}
