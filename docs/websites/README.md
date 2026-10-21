# Municipal websites (`apps/web`)

One Next.js app serves **one municipality per build**:

| `NEXT_PUBLIC_SITE_ID` | Site | Domain |
| --- | --- | --- |
| `shamli` (default) | Nagar Palika Parishad Shamli | nppshamli.in |
| `chhata` | Nagar Panchayat Chhata, Mathura | npchhata.com |

`next.config.ts` aliases `@site/config` → `sites/<id>.ts` and `@site/variant` →
`sites/variants/<id>.tsx` at build time, so the other site's pages, strings and assets are not in
the bundle (CI greps both builds to enforce this). Separate deployments, separate env.

## Routes

| Route | Shamli | Chhata |
| --- | --- | --- |
| `/` | config-driven home (hero, public messages, e-services, about, budget docs, contact) | existing Chhata home |
| `/about`, `/contact`, `/services`, `/public-grievance` | config-driven pages | existing Chhata pages |
| `/e-services`, `/notices`, `/documents`, `/rti` | config-driven (shared) | config-driven (added from the Shamli reference IA) |
| `/propertytax/**` | property tax search, dues, online payment, receipts (branded from config) | same |
| `/departments`, `/schemes`, `/staff`, `/gallery` | 404 (no verified content) | existing pages |
| `/sitemap.xml`, `/robots.txt` | generated from config (personal dues/receipt pages disallowed) | same |

Accessibility: skip link, labelled navigation with `aria-current`, keyboard/Escape-closable mobile
menu, ≥ 40 px touch targets, `lang="hi"` on Hindi text, external links announced.

## Content rules

- Every fact has a `source` and `reviewedOn` in `sites/*.ts`; anything not confirmed is
  `verified: false` and is not rendered. Never invent notices, officials, schemes or contacts.
- Notices: `sites/<id>.ts → notices` (empty = honest "No notices published yet" state).
- Private survey data is never shown; the property-tax pages use the public API which masks
  owner/mobile in search results.

## Reference inventory (scraping)

`scripts/site-inventory/inventory-reference-site.mjs` builds a reviewable inventory of a public
reference site (default `https://nppshamli.in`):

```bash
node scripts/site-inventory/inventory-reference-site.mjs              # structure only
node scripts/site-inventory/inventory-reference-site.mjs --content    # + tables, paragraphs, document & image URLs
```

It honours robots.txt, fetches only an allow-list of public pages, one request every 2 s with an
identifying User-Agent, never submits forms or bypasses access controls, and redacts e-mail
addresses and phone numbers. Output goes to `tmp/site-inventory/` (gitignored) for human review.

See [shamli-content-review.md](shamli-content-review.md) and
[chhata-ia-from-shamli.md](chhata-ia-from-shamli.md).

## Before switching nppshamli.in DNS to this site

1. Copy the 103 PDFs listed in `sites/shamli-documents.json` from the old server (they are
   currently linked at `https://nppshamli.in/documents/…`, which will disappear with the old site)
   into object storage or `public/documents/`, and update the `href`s.
2. Have the municipality confirm the officials, notices and PIO details; add them as `verified: true`.
3. Set `PUBLIC_WEB_URL=https://nppshamli.in` and the Dokploy domain.
