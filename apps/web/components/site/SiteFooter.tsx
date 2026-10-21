import { Mail, MapPin, Phone } from "lucide-react"
import Link from "next/link"

import { publishableContact, site } from "@/lib/site"

export function SiteFooter() {
  const contact = publishableContact()
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto bg-gov-blue-dark text-slate-200 print:hidden">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 md:px-8 lg:grid-cols-3">
        <section aria-labelledby="footer-about">
          <h2 id="footer-about" className="text-base font-bold text-white">
            {site.identity.nameEn}
          </h2>
          <p className="mt-1 text-sm text-slate-300" lang="hi">
            {site.identity.nameHi}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            District {site.identity.district}, {site.identity.state}, India.
          </p>
        </section>
        <section aria-labelledby="footer-links">
          <h2 id="footer-links" className="text-base font-bold text-white">
            Quick links
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 text-sm">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-10 items-center hover:text-white hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="footer-contact">
          <h2 id="footer-contact" className="text-base font-bold text-white">
            Contact
          </h2>
          {contact ? (
            <ul className="mt-3 space-y-2 text-sm">
              {contact.addressLines?.length ? (
                <li className="flex gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{contact.addressLines.join(", ")}</span>
                </li>
              ) : null}
              {contact.phones.map((p) => (
                <li key={p.value}>
                  <a href={p.href} className="inline-flex min-h-10 items-center gap-2 hover:underline">
                    <Phone className="size-4 shrink-0" aria-hidden />
                    {p.label}: {p.value}
                  </a>
                </li>
              ))}
              {contact.emails.map((e) => (
                <li key={e}>
                  <a href={`mailto:${e}`} className="inline-flex min-h-10 items-center gap-2 break-all hover:underline">
                    <Mail className="size-4 shrink-0" aria-hidden />
                    {e}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-300">Contact details are being verified with the office.</p>
          )}
        </section>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-slate-400 md:px-8">
          © {year} {site.identity.nameEn}. Information is published by the municipality; contact the office to confirm
          time-sensitive details.
        </p>
      </div>
    </footer>
  )
}
