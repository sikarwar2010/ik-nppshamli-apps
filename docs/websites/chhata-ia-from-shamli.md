# Chhata website — information architecture adopted from the Shamli reference

The Shamli website (nppshamli.in) was inventoried (`docs/websites/shamli-content-review.md`) and
its page types compared with the existing Chhata site. Only structure and statewide services were
adopted — no Shamli branding, text or images are used for Chhata.

| Shamli reference page | Chhata before | Chhata now |
| --- | --- | --- |
| मुख्य पृष्ठ (home) | home | unchanged |
| पालिका को जानें (about, members, officers) | `/about`, `/staff` | unchanged |
| बजट-ऑडिट (budget & audit PDFs) | — | **`/documents`** (empty state until documents are provided) |
| अमृत / रिफार्म (scheme documents) | `/schemes` | unchanged; documents go to `/documents` |
| सूचना / निविदा (notices / tenders) | commented-out "News And Notice" menu item | **`/notices`** (empty state; no invented notices) |
| जन्म / मृत्यु पंजीकरण, ई-सुविधा, property/marriage registration, जनसुनवाई (external portals) | partly inside `/services` | **`/e-services`** (CRS, IGRS, Jansunwai, property tax) |
| सूचना का अधिकार (RTI) | — | **`/rti`** (Act guidance; PIO to be confirmed) |
| शिकायत (grievance) | `/public-grievance` | unchanged (+ Jansunwai on `/e-services`) |
| संपर्क (contact) | `/contact` | unchanged |
| Property tax / mutation | `/propertytax` | unchanged (now branded from config) |

The Chhata navbar (`components/navigation/Navbar.tsx`) now links e-Services, Notices, Documents
and RTI.

## Items to verify for Chhata (found while extracting `sites/chhata.ts`)

- Office phone differs across existing pages: `tel:+918189077892`, displayed `+91 8189077953`
  and `+91 818907793` (9 digits). Config contact is marked `verified: false` (not rendered by the
  new pages) until confirmed.
- Pincode differs: footer `250606`, map link / old portal default `281401`. Omitted until confirmed.
- The Chhata navbar renders links client-side only (not in server HTML) — consider rendering the
  menu on the server for SEO.
