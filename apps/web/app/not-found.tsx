import Link from "next/link"

import { site } from "@/lib/site"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold tracking-wider text-gov-blue-medium uppercase">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">This page of {site.identity.nameEn} is not available.</p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-gov-blue-dark px-5 font-semibold text-white hover:bg-gov-blue-medium"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
