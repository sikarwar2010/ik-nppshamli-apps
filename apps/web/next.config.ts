import type { NextConfig } from "next"
import path from "node:path"
import { fileURLToPath } from "node:url"

const apiInternal =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"

/**
 * One municipality per build. Site-specific modules are aliased at build time
 * so the other site's pages, content and assets never enter the bundle.
 */
const siteId = process.env.NEXT_PUBLIC_SITE_ID === "chhata" ? "chhata" : "shamli"
const siteAliases = {
  "@site/config": `./sites/${siteId}.ts`,
  "@site/variant": `./sites/variants/${siteId}.tsx`,
}

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@workspace/ui", "@workspace/types", "@workspace/api-client"],
  env: { NEXT_PUBLIC_SITE_ID: siteId },
  turbopack: { resolveAlias: siteAliases },
  webpack: (config) => {
    const appDir = path.dirname(fileURLToPath(import.meta.url))
    config.resolve.alias = {
      ...config.resolve.alias,
      "@site/config": path.join(appDir, `sites/${siteId}.ts`),
      "@site/variant": path.join(appDir, `sites/variants/${siteId}.tsx`),
    }
    return config
  },
  async rewrites() {
    // Production Atom gateway callbacks use ATOM_CALLBACK_URL on PUBLIC_WEB_URL;
    // server-to-server POSTs to /api/v1/payments/gateway/callback are proxied
    // here to API_INTERNAL_URL (Nest PaymentsController).
    const apiProxy = {
      source: "/api/:path*",
      destination: `${apiInternal}/api/:path*`,
    }
    return {
      afterFiles: [apiProxy],
      fallback: [apiProxy],
    }
  },
}

export default nextConfig
