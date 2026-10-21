import { site } from "@/lib/site"

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center bg-background">
      <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">
        Loading {site.identity.nameEn}…
      </div>
    </div>
  )
}
