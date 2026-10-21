# Ward 3 — Lajpat Rai: import & reconciliation report

Source: `3-Lajpat-Rai.xlsx` (Survey Data 199 rows incl. header × 39 columns; Parcel Images
251 rows incl. header × 8 columns). Environment: **local development stack** (Docker Postgres +
MinIO). Production has not been imported — see "Remaining steps". Personal data (names, mobile
numbers) is deliberately not reproduced here; full reports with row details are generated to
`tmp/reports/` (gitignored).

## Validation (dry run)

| Sheet | Data rows | Errors | Warnings |
| --- | --- | --- | --- |
| Survey Data | 198 | 0 | 29 × `NON_GIS_PROPERTY_ID` |
| Parcel Images | 250 | 0 | 0 |

Status counts: Submitted 120 · In Progress 54 · Draft 24.

Non-GIS Property Ids imported unchanged (all In Progress / Draft): `117`, `150/1`, `159/1`, `35`,
`131`, `162` and 23 × `TEMP-MOBILE-…`.

Duplicate candidates — same Parcel No + Unit No, different Property Id (kept as separate records,
need field review before any merge):

| Parcel/Unit | Property Ids |
| --- | --- |
| 00116/000 | `117`, `800645-003-00116-000-R` |
| 00150/000 | `800645-003-00150-000-R`, `150/1` |
| 00159/000 | `800645-003-00159-000-R`, `159/1` |
| 00162/000 | `800645-003-00162-000-R`, `35` |
| 00077/000 | `800645-003-00077-000-R`, `TEMP-MOBILE-448ACEAFA74F4E6B` |

Three image rows for draft surveys carry Parcel No `""` while the survey row has `N/A`; treated
as equivalent blanks (no warning). 72 surveys have no images.

## Import runs

| Run | Surveys created / updated / unchanged / failed | Images created / unchanged / failed |
| --- | --- | --- |
| 1st import | 198 / 0 / 0 / 0 | 250 / 0 / 0 |
| Re-import, same file | 0 / 0 / 198 / 0 | 0 / 250 / 0 |
| After rollback test (`rollback-shamli-import`) | 198 revived | 0 / 250 / 0 |

Idempotency check: 198 surveys / 198 distinct ids, 250 images / 250 distinct source URLs,
302 floor rows on 172 surveys (26 have no Floors), no spurious audit updates on re-import.

## Image migration to MinIO (bucket `shamli-survey-images`)

| Run | Outcome |
| --- | --- |
| Batch of 5 | 5 migrated (2,023,272 bytes) |
| Remaining | 245 migrated (76,434,840 bytes) → 250 AVAILABLE |
| `--verify-available` | 250 verified, nothing re-uploaded |
| Simulated object loss (1 object deleted, row FAILED) | default run skips it; `--retry-failed` re-migrated it |
| Inaccessible source test (temporary 404 URL) | recorded `FAILED · HTTP 404 from source`, 1 attempt, listed in report; test row removed |

Every object is verified after upload (size + SHA-256 metadata); reconciliation re-downloads all
250 objects and re-hashes them.

## Reconciliation (`reconcile-shamli-workbook`, final run 2026-10-21) — **MATCH**

| Check | Result |
| --- | --- |
| Survey rows found in DB | 198 / 198, none missing, no extra active records in ward 3 |
| Survey field comparisons (198 × 39 columns, independent rule table) | 7,722 — 0 mismatches |
| Verbatim source snapshot per cell | 0 mismatches |
| Structured floor rows vs Floors segments | 0 mismatches |
| Image field comparisons (250 × 8) | 2,000 — 0 mismatches |
| Images available in MinIO, size + SHA-256 re-verified | 250 / 250, 0 missing files |
| Export round-trip (portal export vs source: headers, every cell, cell types) | 0 differences |

Negative control: corrupting one parcel (`00001`→`000001`) and one latitude in the DB produced 4
field mismatches and 4 export mismatches as expected (values restored afterwards).

Documented transformations (source → DB): `N/A`/blank → NULL in typed columns (raw kept in
`sourceExtras`); Status mapped to portal status (raw kept in `sourceStatus`); Ward Name resolved
to ward 3 by number (portal ward name is the Hindi `वार्ड नंबर 3 - लाजपत राय`).

## Remaining steps

1. Production: take a `pg_dump`, run the dry run, import with an admin actor, run the image
   migration (needs MinIO credentials and outbound HTTPS to `backend.sdvedutech.in`), reconcile.
2. Field team to resolve the 5 duplicate candidates and 29 non-GIS draft ids.
