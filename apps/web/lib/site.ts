import config from "@site/config"

import type { SiteConfig } from "@/sites/types"

/**
 * The municipality this build serves. `@site/config` is resolved at build time
 * from NEXT_PUBLIC_SITE_ID (next.config.ts), so each deployment bundles only
 * its own content. Default: Shamli.
 */
export const site: SiteConfig = config

/** Phone/email/address are only rendered when verified for publication. */
export function publishableContact(cfg: SiteConfig = site) {
  return cfg.contact.verified ? cfg.contact : null
}

export function absoluteUrl(path = "/"): string {
  return `${site.origin}${path.startsWith("/") ? path : `/${path}`}`
}
