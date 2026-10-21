# nppshamli.in — content review (2026-10-21)

Reviewed with `scripts/site-inventory/inventory-reference-site.mjs` (13 allow-listed pages; no
robots.txt is published — HTTP 404). The existing site is an ASP.NET site footer-dated 2020.

## Published on the new site (`apps/web/sites/shamli.ts`)

| Content | Source page | Notes |
| --- | --- | --- |
| Municipality name (Hindi/English) | all pages | |
| Introduction / history (Hindi) | `Abouts.aspx` | Condensed to three paragraphs, spelling normalised, facts unchanged; "(मुज़फ्फरनगर)" removed — Shamli has been a separate district since 2011 |
| Location, elevation, distance from Delhi/Saharanpur, Upper Doab Sugar Mill (1933) | `statistics.aspx`, `Abouts.aspx` | |
| Office phone 01398-250049, fax 01398-250054, e-mail nppshamli@gmail.com | `contact.aspx` | Office lines only |
| Public civic messages (5) | home page "Latest News and Updates" | Civic messages, not formal notices |
| e-service links: CRS birth/death, e-Nagarsewa, IGRS registration, e-Suvidha Shamli, Jansunwai | home page links | URLs as published; IGRS and Jansunwai verified reachable over HTTPS; e-Suvidha only over HTTP; **CRS and e-Nagarsewa could not be reached from the build machine** (time-outs / TLS errors) — re-check from India before go-live |
| 103 documents (budgets 2014-20, balance sheets 2010-18, audit reports, AMRUT/reform documents, plans, 72 e-Patrika issues) | `Budget.aspx`, `amrut.aspx` | All 103 checked: HTTP 200, `application/pdf` |
| RTI guidance (general provisions of the RTI Act, 2005) | `rti1.aspx` | No PIO named on the old site |

## Withheld (needs confirmation by the municipality)

| Content | Reason |
| --- | --- |
| Chairman and Executive Officer names/photos | From the 2020-era site; likely outdated |
| Board member list (20 wards) | The portal now has 25 wards — list is outdated |
| Executive Officer personal mobile number | Personal number; publish only the office line |
| Ward-wise population table | Old table (2008–09) and empty values |
| Notices and tenders | `notice.aspx` and `tender.aspx` return HTTP 500 ("Runtime Error") — no verified notices exist to publish |
| Birth/death procedure text (delay fee, SDM order) | May be outdated after the 2023 RBD Act amendment; linked to CRS instead |
| Online grievance form fields | Grievances are routed to Jansunwai (State system) and the office; no unmonitored form |

## Assets

The new site uses the Government of Uttar Pradesh emblem already in the repository
(`public/branding/up-government-logo.png`). Images from the old site (header logo, officials'
photos, animations) were not copied.
