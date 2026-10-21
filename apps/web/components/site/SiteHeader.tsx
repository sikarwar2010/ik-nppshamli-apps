import { Phone } from "lucide-react"
import Link from "next/link"

import { publishableContact, site } from "@/lib/site"

import { SiteNav } from "./SiteNav"

export function SiteHeader() {
  const contact = publishableContact()
  const phone = contact?.phones[0]
  const { identity } = site
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-50 rounded bg-white px-4 py-2 font-semibold text-gov-blue-dark focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>
      <div className="bg-gov-blue-medium text-xs text-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 md:px-8">
          <span>
            Government of {identity.state} · <span lang="hi">उत्तर प्रदेश सरकार</span>
          </span>
          {phone ? (
            <a href={phone.href} className="inline-flex min-h-8 items-center gap-1.5 hover:underline">
              <Phone className="size-3.5" aria-hidden />
              {phone.label}: {phone.value}
            </a>
          ) : null}
        </div>
      </div>
      <header className="border-b border-slate-200 bg-white print:border-0">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 md:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3 sm:gap-4" aria-label={`${identity.nameEn} — home`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static emblem from /public */}
            <img
              src={identity.logo.src}
              alt={identity.logo.alt}
              width={72}
              height={72}
              className="size-14 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1 sm:size-[72px]"
            />
            <span className="min-w-0">
              <span className="block font-serif text-xl leading-tight font-extrabold text-gov-blue-dark sm:text-3xl" lang="hi">
                {identity.nameHi}
              </span>
              <span className="mt-0.5 block text-sm font-bold tracking-wide text-gov-blue-medium uppercase sm:text-base">
                {identity.nameEn}
              </span>
              <span className="block text-xs text-slate-500 sm:text-sm">
                District {identity.district}, {identity.state}
              </span>
            </span>
          </Link>
        </div>
      </header>
      <SiteNav items={site.nav} />
    </>
  )
}
