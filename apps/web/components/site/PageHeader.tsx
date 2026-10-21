import Link from "next/link"

export function PageHeader({
  title,
  titleHi,
  description,
}: {
  title: string
  titleHi?: string
  description?: string
}) {
  return (
    <div className="border-b border-slate-200 bg-gov-blue-light">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li aria-current="page" className="font-medium text-slate-800">
              {title}
            </li>
          </ol>
        </nav>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gov-blue-dark md:text-4xl">{title}</h1>
        {titleHi ? (
          <p className="mt-1 text-lg font-semibold text-gov-blue-medium" lang="hi">
            {titleHi}
          </p>
        ) : null}
        {description ? <p className="mt-3 max-w-3xl text-base text-slate-700">{description}</p> : null}
      </div>
    </div>
  )
}
