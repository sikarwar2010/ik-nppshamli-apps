import { ArrowRight, ExternalLink, FileText, Mail, Megaphone, Phone, ReceiptIndianRupee } from "lucide-react"
import Link from "next/link"

import { publishableContact, site } from "@/lib/site"
import type { DocumentLink, ExternalService } from "@/sites/types"

import { PageHeader } from "./PageHeader"

const container = "mx-auto max-w-7xl px-4 md:px-8"

function isExternal(href: string) {
  return /^https?:\/\//.test(href)
}

function SmartLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  if (isExternal(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
        <span className="sr-only"> (opens an external website)</span>
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

function ServiceCard({ service }: { service: ExternalService }) {
  return (
    <li className="flex">
      <SmartLink
        href={service.href}
        className="group flex w-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-gov-blue-medium hover:shadow-md focus-visible:outline-2 focus-visible:outline-gov-blue-medium"
      >
        <span className="text-lg font-bold text-gov-blue-dark">{service.title}</span>
        <span className="text-sm font-semibold text-gov-saffron-dark" lang="hi">
          {service.titleHi}
        </span>
        <span className="mt-2 flex-1 text-sm text-slate-600">{service.description}</span>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gov-blue-medium">
          {isExternal(service.href) ? "Open portal" : "Open"}
          {isExternal(service.href) ? (
            <ExternalLink className="size-4" aria-hidden />
          ) : (
            <ArrowRight className="size-4" aria-hidden />
          )}
        </span>
        <span className="mt-2 text-xs text-slate-500">Operated by: {service.operator}</span>
      </SmartLink>
    </li>
  )
}

function ContactList() {
  const contact = publishableContact()
  if (!contact) {
    return <p className="text-slate-600">Contact details are being verified with the office and will be published shortly.</p>
  }
  return (
    <ul className="space-y-2 text-base">
      {contact.addressLines?.length ? <li>{contact.addressLines.join(", ")}</li> : null}
      {contact.phones.map((p) => (
        <li key={p.value}>
          <a href={p.href} className="inline-flex min-h-11 items-center gap-2 font-semibold text-gov-blue-medium hover:underline">
            <Phone className="size-4" aria-hidden /> {p.label}: {p.value}
          </a>
        </li>
      ))}
      {contact.emails.map((e) => (
        <li key={e}>
          <a href={`mailto:${e}`} className="inline-flex min-h-11 items-center gap-2 font-semibold break-all text-gov-blue-medium hover:underline">
            <Mail className="size-4" aria-hidden /> {e}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function SiteHome() {
  const { identity, about, publicMessages, externalServices, documents } = site
  const featuredDocs = documents.items.filter((d) => d.category === "Budget" || d.category === "Audit").slice(0, 4)
  return (
    <>
      <section className="bg-gov-blue-dark text-white">
        <div className={`${container} grid gap-8 py-12 md:py-16 lg:grid-cols-[3fr_2fr] lg:items-center`}>
          <div>
            <p className="text-sm font-semibold tracking-widest text-gov-saffron uppercase">
              {identity.district}, {identity.state}
            </p>
            <h1 className="mt-2 text-3xl leading-tight font-extrabold sm:text-4xl md:text-5xl" lang="hi">
              {identity.nameHi}
            </h1>
            <p className="mt-2 text-xl font-semibold text-slate-200">{identity.nameEn}</p>
            {about.introEn[0] ? <p className="mt-4 max-w-2xl text-base text-slate-200">{about.introEn[0]}</p> : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/propertytax"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-gov-saffron px-5 font-bold text-gov-blue-dark hover:bg-gov-saffron-dark"
              >
                <ReceiptIndianRupee className="size-5" aria-hidden /> Pay property tax
              </Link>
              <Link
                href="/services"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/40 px-5 font-semibold hover:bg-white/10"
              >
                Citizen e-services
              </Link>
            </div>
          </div>
          {publicMessages.length ? (
            <aside aria-labelledby="public-messages" className="rounded-xl bg-white/10 p-5">
              <h2 id="public-messages" className="flex items-center gap-2 font-bold">
                <Megaphone className="size-5 text-gov-saffron" aria-hidden /> <span lang="hi">जन संदेश</span> · Public messages
              </h2>
              <ul className="mt-3 space-y-2 text-base" lang="hi">
                {publicMessages.map((m) => (
                  <li key={m.text} className="border-l-2 border-gov-saffron pl-3">
                    {m.text}
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="services-heading" className={`${container} py-12`}>
        <h2 id="services-heading" className="text-2xl font-extrabold text-gov-blue-dark">
          Citizen services <span className="text-lg font-semibold text-gov-saffron-dark" lang="hi">· नागरिक सेवाएँ</span>
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {externalServices.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </ul>
      </section>

      <section className="bg-gov-blue-light">
        <div className={`${container} grid gap-8 py-12 lg:grid-cols-2`}>
          {about.introHi.length ? (
            <div>
              <h2 className="text-2xl font-extrabold text-gov-blue-dark">
                About {identity.shortName} <span className="text-lg font-semibold text-gov-saffron-dark" lang="hi">· परिचय</span>
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-700" lang="hi">
                {about.introHi[0]}
              </p>
              <Link href="/about" className="mt-4 inline-flex min-h-11 items-center gap-1.5 font-semibold text-gov-blue-medium hover:underline">
                Read more <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          ) : null}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {featuredDocs.length ? (
              <div>
                <h2 className="text-xl font-extrabold text-gov-blue-dark">Budget &amp; reports</h2>
                <ul className="mt-3 space-y-1">
                  {featuredDocs.map((d) => (
                    <li key={d.href}>
                      <a href={d.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 text-gov-blue-medium hover:underline">
                        <FileText className="size-4 shrink-0" aria-hidden /> {d.title} <span className="sr-only">(PDF)</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <Link href="/documents" className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-gov-blue-medium hover:underline">
                  All documents <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            ) : null}
            <div>
              <h2 className="text-xl font-extrabold text-gov-blue-dark">Contact the office</h2>
              <div className="mt-3">
                <ContactList />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export function SiteAbout() {
  const { identity, about } = site
  return (
    <>
      <PageHeader title={`About ${identity.nameEn}`} titleHi="पालिका को जानें" />
      <div className={`${container} grid gap-10 py-10 lg:grid-cols-[2fr_1fr]`}>
        <article className="space-y-4 text-base leading-relaxed text-slate-800">
          {about.introHi.map((p) => (
            <p key={p} lang="hi">
              {p}
            </p>
          ))}
          {about.introEn.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {!about.introHi.length && !about.introEn.length ? (
            <p className="text-slate-600">An introduction will be published once provided by the municipality.</p>
          ) : null}
        </article>
        {about.facts.length ? (
          <aside aria-labelledby="facts" className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 id="facts" className="text-lg font-bold text-gov-blue-dark">
              At a glance
            </h2>
            <dl className="mt-3 divide-y divide-slate-100">
              {about.facts.map((f) => (
                <div key={f.label} className="flex justify-between gap-4 py-2 text-sm">
                  <dt className="text-slate-600">{f.label}</dt>
                  <dd className="text-right font-semibold text-slate-900">{f.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        ) : null}
      </div>
    </>
  )
}

export function SiteServices() {
  return (
    <>
      <PageHeader
        title="Citizen e-services"
        titleHi="ई-सेवाएँ"
        description="Online services of the municipality and official State / Union government portals used by citizens."
      />
      <div className={`${container} py-10`}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {site.externalServices.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </ul>
      </div>
    </>
  )
}

export function SiteNotices() {
  const notices = site.notices.filter((n) => n.verified)
  return (
    <>
      <PageHeader title="Notices & announcements" titleHi="सूचना" />
      <div className={`${container} py-10`}>
        {notices.length ? (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {notices.map((n) => (
              <li key={n.id} className="p-5">
                <p className="text-sm text-slate-500">
                  <time dateTime={n.publishedOn}>{new Date(n.publishedOn).toLocaleDateString("en-IN", { dateStyle: "long" })}</time>
                </p>
                <h2 className="mt-1 text-lg font-bold text-gov-blue-dark">
                  {n.href ? <SmartLink href={n.href} className="hover:underline">{n.title}</SmartLink> : n.title}
                </h2>
                {n.summary ? <p className="mt-1 text-slate-700">{n.summary}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div role="status" className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <Megaphone className="mx-auto size-8 text-slate-400" aria-hidden />
            <h2 className="mt-3 text-lg font-bold text-slate-800">No notices published yet</h2>
            <p className="mx-auto mt-1 max-w-xl text-slate-600">
              Official notices and tenders will appear here once released by {site.identity.nameEn}. For current information
              please contact the office.
            </p>
            <Link href="/contact" className="mt-4 inline-flex min-h-11 items-center font-semibold text-gov-blue-medium hover:underline">
              Contact details
            </Link>
          </div>
        )}
      </div>
    </>
  )
}

const CATEGORY_ORDER: DocumentLink["category"][] = [
  "Budget",
  "Balance Sheet",
  "Audit",
  "AMRUT / Reforms",
  "Plans & Reports",
  "e-Patrika",
  "Other",
]

export function SiteDocuments() {
  const { items, note } = site.documents
  const groups = CATEGORY_ORDER.map((c) => ({ category: c, docs: items.filter((d) => d.category === c) })).filter((g) => g.docs.length)
  return (
    <>
      <PageHeader title="Budget, audit & reports" titleHi="बजट-ऑडिट एवं प्रतिवेदन" description="Public financial statements, audit reports and scheme documents (PDF)." />
      <div className={`${container} space-y-8 py-10`}>
        {groups.length ? (
          groups.map((g) => {
            const list = (
              <ul className="mt-3 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {g.docs.map((d) => (
                  <li key={d.href}>
                    <a href={d.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-start gap-2 py-1 text-gov-blue-medium hover:underline">
                      <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        {d.title} <span className="text-xs text-slate-500">(PDF)</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )
            return g.docs.length > 12 ? (
              <details key={g.category} className="rounded-xl border border-slate-200 bg-white p-5">
                <summary className="min-h-11 cursor-pointer text-xl font-bold text-gov-blue-dark">
                  {g.category} ({g.docs.length})
                </summary>
                {list}
              </details>
            ) : (
              <section key={g.category} aria-labelledby={`doc-${g.category}`}>
                <h2 id={`doc-${g.category}`} className="text-xl font-bold text-gov-blue-dark">
                  {g.category}
                </h2>
                {list}
              </section>
            )
          })
        ) : (
          <p role="status" className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            {note ?? "No documents published yet."}
          </p>
        )}
      </div>
    </>
  )
}

export function SiteRti() {
  return (
    <>
      <PageHeader title="Right to Information" titleHi="सूचना का अधिकार" />
      <div className={`${container} grid gap-8 py-10 lg:grid-cols-[2fr_1fr]`}>
        <article className="space-y-4 text-base leading-relaxed text-slate-800" lang="hi">
          {site.rti.guidanceHi.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </article>
        <aside className="h-fit rounded-xl border border-amber-200 bg-gov-orange-light p-5">
          <h2 className="font-bold text-gov-blue-dark">Public Information Officer</h2>
          <p className="mt-2 text-sm text-slate-700">{site.rti.officerNote}</p>
          <div className="mt-3">
            <ContactList />
          </div>
        </aside>
      </div>
    </>
  )
}

export function SiteContact() {
  return (
    <>
      <PageHeader title="Contact us" titleHi="संपर्क" description={`Office of ${site.identity.nameEn}, District ${site.identity.district}, ${site.identity.state}.`} />
      <div className={`${container} py-10`}>
        <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ContactList />
        </div>
      </div>
    </>
  )
}

export function SiteGrievance() {
  return (
    <>
      <PageHeader title="Public grievance" titleHi="शिकायत दर्ज कराएं" description="Choose the channel that suits you. Complaints filed on Jansunwai can be tracked online." />
      <div className={`${container} py-10`}>
        <ul className="grid gap-4 md:grid-cols-2">
          {site.grievance.channels.map((c) => (
            <li key={c.title} className="flex">
              {c.href ? (
                <SmartLink href={c.href} className="flex w-full flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-gov-blue-medium">
                  <span className="text-lg font-bold text-gov-blue-dark">{c.title}</span>
                  <span className="mt-2 text-slate-700">{c.description}</span>
                </SmartLink>
              ) : (
                <div className="w-full rounded-xl border border-slate-200 bg-white p-6">
                  <p className="text-lg font-bold text-gov-blue-dark">{c.title}</p>
                  <p className="mt-2 text-slate-700">{c.description}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
