#!/usr/bin/env node
/**
 * Controlled, reviewable inventory of a public reference website (default:
 * https://nppshamli.in) used to plan the information architecture of the
 * municipal websites in apps/web.
 *
 *   node scripts/site-inventory/inventory-reference-site.mjs [--base https://nppshamli.in] [--out tmp/site-inventory]
 *
 * Rules (see docs/websites/README.md):
 * - Honours robots.txt (Disallow rules for "*" and our user agent).
 * - Fetches only the allow-listed public pages below — no crawling, no forms,
 *   no authentication, no CAPTCHA handling.
 * - One request at a time with a 2 s delay; identifies itself via User-Agent.
 * - Records STRUCTURE only: title, headings, navigation/external link labels
 *   and targets, word count. Body text, images, phone numbers and e-mail
 *   addresses are not stored. Content for the new sites must be verified with
 *   the municipality, not copied from this inventory.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), all[i + 1]])
    return acc
  }, [])
)
const BASE = (args.base ?? "https://nppshamli.in").replace(/\/$/, "")
const OUT = args.out ?? "tmp/site-inventory"
const USER_AGENT = "NPP-Website-IA-Inventory/1.0 (+reference review; contact: site maintainers)"
const DELAY_MS = 2000

/** Public pages linked from the reference home page navigation. */
const PAGES = [
  "/",
  "/index.aspx",
  "/Abouts.aspx",
  "/Budget.aspx",
  "/amrut.aspx",
  "/notice.aspx",
  "/feedback.aspx",
  "/contact.aspx",
  "/tender.aspx",
  "/grievance.aspx",
  "/rti1.aspx",
  "/statistics.aspx",
  "/Places.aspx",
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function decode(html) {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

function text(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim()
}

/** Remove contact details so the inventory never stores personal data. */
function redact(value) {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/(\+?\d[\d\s-]{7,}\d)/g, "[phone]")
}

function parseRobots(body) {
  const rules = []
  let applies = false
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim()
    const [k, ...rest] = line.split(":")
    const v = rest.join(":").trim()
    if (/^user-agent$/i.test(k ?? "")) applies = v === "*" || USER_AGENT.toLowerCase().includes(v.toLowerCase())
    else if (applies && /^disallow$/i.test(k ?? "") && v) rules.push(v)
  }
  return rules
}

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(30_000) })
  return { status: res.status, type: res.headers.get("content-type") ?? "", body: await res.text() }
}

async function main() {
  const robots = await get(`${BASE}/robots.txt`).catch(() => null)
  const robotsAvailable = robots?.status === 200 && /text\/plain/i.test(robots.type)
  const disallow = robotsAvailable ? parseRobots(robots.body) : []
  await sleep(DELAY_MS)

  const pages = []
  for (const p of PAGES) {
    if (disallow.some((rule) => p.startsWith(rule))) {
      pages.push({ path: p, skipped: "disallowed by robots.txt" })
      continue
    }
    try {
      const res = await get(BASE + p)
      const html = res.body
      const title = text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
      const headings = [...html.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi)]
        .map((m) => ({ level: Number(m[1]), text: redact(text(m[2])) }))
        .filter((h) => h.text)
      const links = [...html.matchAll(/<a\b[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
        label: redact(text(m[2])),
        href: decode(m[1]),
      }))
      const internal = [...new Map(links.filter((l) => !/^https?:/i.test(l.href) || l.href.includes(new URL(BASE).hostname)).map((l) => [l.href, l])).values()]
      const external = [...new Map(links.filter((l) => /^https?:/i.test(l.href) && !l.href.includes(new URL(BASE).hostname)).map((l) => [l.href, l])).values()]
      const words = text(html).split(" ").filter(Boolean).length
      pages.push({
        path: p,
        status: res.status,
        title: redact(title),
        looksLikeErrorPage: /404|not found|error/i.test(title) || words < 60,
        headings,
        internalLinks: internal,
        externalLinks: external,
        wordCount: words,
      })
    } catch (err) {
      pages.push({ path: p, error: String(err) })
    }
    await sleep(DELAY_MS)
  }

  const externalServices = [...new Map(pages.flatMap((p) => p.externalLinks ?? []).map((l) => [l.href, l])).values()]
  const inventory = {
    base: BASE,
    generatedAt: new Date().toISOString(),
    robots: robotsAvailable ? { disallow } : "no robots.txt published (HTTP " + (robots?.status ?? "n/a") + ")",
    policy: "Structure only; contact details redacted; verify all content with the municipality before publishing.",
    pages,
    externalServices,
  }
  await mkdir(OUT, { recursive: true })
  const file = path.join(OUT, `inventory-${new URL(BASE).hostname}.json`)
  await writeFile(file, JSON.stringify(inventory, null, 2))
  console.log(`Inventoried ${pages.length} page(s) → ${file}`)
  for (const p of pages) {
    console.log(`${String(p.status ?? p.skipped ?? p.error).padEnd(4)} ${p.path.padEnd(18)} ${p.looksLikeErrorPage ? "(error/empty) " : ""}${p.title ?? ""} · ${p.wordCount ?? 0} words · ${p.headings?.length ?? 0} headings · ${p.externalLinks?.length ?? 0} external links`)
  }
  console.log("External services:", externalServices.map((s) => `${s.label} → ${s.href}`).join("\n  "))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
