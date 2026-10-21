# Shamli survey workbook import

Imports the Shamli survey export (e.g. `3-Lajpat-Rai.xlsx`) — sheets **Survey Data**
(39 columns) and **Parcel Images** (8 columns) — into the portal. Detected automatically
by header (`Property Id`, `Unit No`, `Surveyor Name`) as preset `shamli-v3-39`; the Chhata
presets are unchanged.

Code: `apps/api/src/imports/shamli-workbook.ts` (parse/validate, pure),
`shamli-import.service.ts` (DB), `shamli-excel-export.ts` (export), CLIs in `apps/api/src/cli/`.

## Running an import

Portal: **Surveys → Import Excel** → upload → review the *Validation preview* (nothing is
written yet: create / update / unchanged / conflicts, duplicate candidates, row issues per
sheet) → **Start import**. `GET /api/v1/imports/:id/preview` re-validates against current data.

CLI (same pipeline, audited actor; reports contain PII — keep them out of git, default `tmp/reports`):

```bash
pnpm --filter api build
cd apps/api
# 1. Backup first (production: see docs/operations/ci-cd.md)
docker exec shamli-postgres pg_dump -U shamli -d shamli -Fc > ../../tmp/backups/pre-import.dump
# 2. Dry run (no writes)
node dist/cli/import-shamli-workbook.js --file /path/3-Lajpat-Rai.xlsx --dry-run
# 3. Import
node dist/cli/import-shamli-workbook.js --file /path/3-Lajpat-Rai.xlsx --actor admin@example.com [--strategy UPDATE|SKIP|CREATE]
# 4. Images → MinIO (docs/storage/minio.md)
node dist/cli/migrate-images-to-minio.js --ward 3
# 5. Reconcile (exit 0 only on full MATCH)
node dist/cli/reconcile-shamli-workbook.js --file /path/3-Lajpat-Rai.xlsx
```

In the production container use `docker compose exec api node dist/cli/<name>.js …`
(copy the workbook in with `docker compose cp`).

## Identity and conflict rules

- **Identity = exact `Property Id` text.** A match in another ward is a *conflict* and is never
  overwritten. Parcel+Unit is **not** used to match: the source contains different Property Ids
  sharing a parcel/unit (reported as *duplicate candidates*, imported as separate records).
- Non-GIS ids (`117`, `150/1`, `TEMP-MOBILE-…`) are imported unchanged with a warning; editing such
  a draft keeps its id until a GIS use code is assigned.
- Strategy `UPDATE` (default) rewrites only rows whose values differ (field-level diff, audited as
  `SURVEY_UPDATED`); identical rows are *unchanged* and not touched. `SKIP` leaves existing rows;
  `CREATE` fails on existing ids. Soft-deleted rows are revived by `UPDATE`.
- Records in the ward that are absent from the file are **never** pruned (unlike the Chhata preset).
- Images are matched by `(survey, Image URL)` (unique index) — re-imports never duplicate them.

## Column mapping (Survey Data)

NULL rule for typed columns: only an empty cell or the exact text `N/A`. Everything else is kept
verbatim (no trimming, re-casing or spelling correction — e.g. `Sellf`, `Shamali` stay as-is).
Every original cell is also stored verbatim in `survey.sourceExtras.source.values` with the Excel
row number (`sourceRowNumber`) for audit.

| Excel column | Portal field | Transformation |
| --- | --- | --- |
| SN | `sourceExtras.source.sn` | text |
| Status | `sourceStatus` + `status` | raw text kept; Submitted→ACTIVE, In Progress→DRAFT, Draft→DRAFT; other values rejected |
| Surveyor Name | `surveyorName` | text |
| Assessment Year | `assessmentYear` | text (`Ay 2026 2027`) |
| Property Id | `surveyId` | exact text, leading zeros preserved |
| Date of Survey | `surveyedAt` | Excel date-time serial stored as the same UTC instant (all values fall 04:00–14:00 UTC = 09:30–19:30 IST); `dd-mm-yyyy` text accepted; blank → NULL |
| Owner Name / Owner Father Name | `ownerName` / `ownerFatherName` | text |
| Mobile No | `mobile` | exact text (`0000000000` kept) |
| Ward Name | `wardId` | number before ` - ` (`3 - Lajpat Rai` → ward 3); must match the Property Id ward segment |
| Is Slum | `isSlum` | Yes/No (N/A → false, the existing column default) |
| Parcel No | `parcelNo` | exact text (`00001`) |
| Unit No | `propertyNo` | exact text (`001`, `000`) |
| old property Number | `oldPropertyNo` | exact text (`01`) |
| Constructed Date | `constructedDate` | text |
| Respondent Name / Relationship | `respondentName` / `respondentRelationship` | text |
| City, Pincode, House No, Locality, Colony | same-named fields | text (Pincode/House No exact, e.g. `00`) |
| Tax Rate Zone | `taxRateZone` | text |
| Property Ownership | `propertyOwnership` | text |
| Property Type | `propertyType` | text |
| Property Uses | `propertyUse` | text |
| Situation, Road Type | `situation`, `roadType` | text |
| Floors | `floorsRaw` + `survey_floor` rows | multiline text kept exactly; parsed into floor rows (label, SqFt, SqMt, usage, factor, construction) |
| Plot / Plinth / Total Built Up Area SqFt | `plotAreaSqFt` / `plinthAreaSqFt` / `totalBuiltUpAreaSqFt` | Decimal(14,4); values with more decimals are rejected, never rounded |
| Is Municipal Water Supply | `hasMunicipalWaterSupply` | Yes/No/N/A → true/false/NULL |
| Total Water Connection | `totalWaterConnections` | whole number or NULL |
| Water Connection Id/Type, Toilet Type | same-named fields | text |
| Is Municipal Waste Service | `hasMunicipalWasteService` | Yes/No/N/A |
| Latitude / Longitude | `latitude` / `longitude` | Decimal(10,7), range-checked |

Sq-metre area columns are not in this workbook and are left NULL (not computed).

**Parcel Images**: Property ID → survey; Ward Number must equal the survey ward; Parcel/Unit
cross-checked (blank ≡ `N/A`); Image Type → `imageType`; Image Name → `originalFileName`;
Image URL → `sourceUrl`. Rows start as `PENDING_MIGRATION` with a planned MinIO key.

## Rollback

Each import writes `imports/<jobId>/pre-import-snapshot.json` and `import-result.json` to storage.

```bash
node dist/cli/rollback-shamli-import.js --job <jobId>                       # plan
node dist/cli/rollback-shamli-import.js --job <jobId> --actor <email> --confirm
```

Created surveys are soft-deleted, updated surveys restored from the snapshot, image rows added to
pre-existing surveys removed. It refuses if records were edited after the import (`--force`
overrides). For a full restore use the pre-import `pg_dump`.

## Export

`POST /api/v1/exports/surveys` produces the same two sheets, headers, order and cell types as the
source when `ULB_CODE=800645` (or `format: "shamli"`). The reconciliation re-imports this export
and compares every cell with the source workbook.

## Ward 3 (Lajpat Rai) results — local run 2026-10-21

See [ward-03-lajpat-rai-reconciliation.md](ward-03-lajpat-rai-reconciliation.md).
