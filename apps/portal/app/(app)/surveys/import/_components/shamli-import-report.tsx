import type { ShamliImportReport } from "./types"

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd
        className={
          "mt-0.5 text-lg font-semibold tabular-nums " +
          (tone === "bad" && value > 0
            ? "text-destructive"
            : tone === "warn" && value > 0
              ? "text-amber-700 dark:text-amber-300"
              : "")
        }
      >
        {value.toLocaleString("en-IN")}
      </dd>
    </div>
  )
}

/** Dry-run / result summary for Shamli workbooks (both sheets). */
export function ShamliImportReportView({ report }: { report: ShamliImportReport }) {
  const s = report.surveys
  const i = report.images
  const preview = report.mode === "preview"
  return (
    <section className="space-y-4" aria-label="Workbook report">
      <div>
        <h3 className="text-sm font-semibold">
          {preview ? "Validation preview (nothing has been written yet)" : "Import result"}
        </h3>
        <p className="text-xs text-muted-foreground">
          {Object.entries(report.sheets)
            .map(([sheet, v]) => `${sheet}: ${v.rows.toLocaleString("en-IN")} rows`)
            .join(" · ")}
          {" · "}generated {new Date(report.generatedAt).toLocaleString("en-IN")}
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Survey Data — {preview ? "would" : "did"}
        </h4>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Total" value={s.total} />
          <Stat label="Create" value={s.created} />
          <Stat label="Update" value={s.updated} />
          <Stat label="Unchanged" value={s.unchanged} />
          <Stat label="Skip" value={s.skipped} />
          <Stat label="Revive" value={s.revived} />
          <Stat label="Fail" value={s.failed} tone="bad" />
        </dl>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Parcel Images
        </h4>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total" value={i.total} />
          <Stat label="Link new" value={i.created} />
          <Stat label="Update" value={i.updated} />
          <Stat label="Unchanged" value={i.unchanged} />
          <Stat label="Fail" value={i.failed} tone="bad" />
          <Stat label="Await migration" value={i.pendingMigration} tone="warn" />
        </dl>
      </div>

      {report.duplicateCandidates.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            {report.duplicateCandidates.length} parcel/unit pair(s) are shared by different Property Ids.
            They are imported as separate records — review before merging.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-900/90 dark:text-amber-200/90">
            {report.duplicateCandidates.map((d) => (
              <li key={`${d.parcelNo}/${d.unitNo}`} className="break-words">
                Parcel {d.parcelNo} / Unit {d.unitNo}: {d.propertyIds.join(", ")} (rows {d.rows.join(", ")})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.conflicts.length ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
          <p className="font-medium text-destructive">
            {report.conflicts.length} Property Id(s) belong to another ward and were not overwritten.
          </p>
        </div>
      ) : null}
    </section>
  )
}
