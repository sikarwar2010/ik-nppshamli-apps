"use client"

import { Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import type { NavItem } from "@/sites/types"

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}

/** Primary navigation: horizontal on desktop, disclosure menu on small screens. */
export function SiteNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  // Close on route change and on Escape (returning focus to the toggle).
  React.useEffect(() => setOpen(false), [pathname])
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  const link = (item: NavItem, mobile: boolean) => {
    const active = isActive(pathname, item.href)
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={
          mobile
            ? `flex min-h-12 items-center justify-between rounded-md px-4 text-base font-semibold ${
                active ? "bg-white/15 text-white" : "text-white/90 hover:bg-white/10"
              }`
            : `inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold whitespace-nowrap ${
                active ? "bg-white/15 text-white" : "text-white/90 hover:bg-white/10 hover:text-white"
              }`
        }
      >
        <span>{item.label}</span>
        {mobile && item.labelHi ? (
          <span className="text-sm font-normal text-white/70" lang="hi">
            {item.labelHi}
          </span>
        ) : null}
      </Link>
    )
  }

  return (
    <nav aria-label="Main" className="bg-gov-blue-dark print:hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 md:px-8">
        <ul className="hidden flex-wrap items-center gap-1 py-1.5 lg:flex">
          {items.map((item) => (
            <li key={item.href}>{link(item, false)}</li>
          ))}
        </ul>
        <button
          ref={buttonRef}
          type="button"
          className="my-1.5 inline-flex min-h-11 items-center gap-2 rounded-md px-3 font-semibold text-white hover:bg-white/10 lg:hidden"
          aria-expanded={open}
          aria-controls="site-mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          Menu
        </button>
      </div>
      {open ? (
        <ul id="site-mobile-menu" className="mx-auto max-w-7xl space-y-1 px-4 pb-4 lg:hidden">
          {items.map((item) => (
            <li key={item.href}>{link(item, true)}</li>
          ))}
        </ul>
      ) : null}
    </nav>
  )
}
