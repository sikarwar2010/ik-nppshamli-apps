"use client"

import {
  Building2,
  ClipboardList,
  Loader2,
  Lock,
  ShieldCheck,
  Wallet,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

import { ApiError, api } from "@/lib/api"
import { ULB } from "@/lib/ulb-branding"

async function clearLegacyAuthCookies() {
  try {
    await fetch("/api/portal/clear-legacy-auth-cookies", {
      method: "POST",
      credentials: "include",
    })
  } catch {
    // Non-fatal — login can still proceed
  }
}

const TRUST_ITEMS = [
  {
    icon: ClipboardList,
    title: "Survey operations",
    titleHi: "सर्वेक्षण संचालन",
    description: "Ward-wise property surveys and GIS-linked records",
  },
  {
    icon: Wallet,
    title: "Payment collection",
    titleHi: "भुगतान संग्रह",
    description: "Offline counter and gateway reconciliation",
  },
  {
    icon: ShieldCheck,
    title: "Secure staff access",
    titleHi: "सुरक्षित स्टाफ पहुँच",
    description: "Role-based access for municipal administrators",
  },
] as const

function stripHttpMetadata(message: string): string {
  return message
    .replace(/\s*\[\d+\s+[A-Z]+\s+[^\]]+\]\s*$/i, "")
    .replace(/\s*\(\d+:\s*[A-Z_]+\)\s*$/i, "")
    .trim()
}

function mapAuthErrorMessage(error: unknown): string {
  const raw =
    error instanceof ApiError || error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ""
  const message = stripHttpMetadata(raw)
  const m = message.toLowerCase()
  if (
    m.includes("signup") ||
    m.includes("sign up") ||
    m.includes("not enabled") ||
    m.includes("disabled") ||
    m.includes("account not linked") ||
    m.includes("user not found") ||
    m.includes("invalid email or password")
  ) {
    return "Your account is not provisioned or the password is incorrect. Contact an administrator."
  }
  if (m.includes("too many requests")) {
    return "Too many login attempts. Please wait a moment and try again."
  }
  return message || "Login failed"
}

export default function LoginPage() {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void clearLegacyAuthCookies()
    const params = new URLSearchParams(window.location.search)
    if (params.get("signedOut") === "1") {
      toast.success("Signed out")
      const url = new URL(window.location.href)
      url.searchParams.delete("signedOut")
      window.history.replaceState({}, "", url.pathname + url.search)
    }
    const error =
      params.get("error") ??
      params.get("error_description") ??
      params.get("message")
    if (error) {
      const msg = mapAuthErrorMessage(decodeURIComponent(error))
      setFormError(msg)
      toast.error(msg)
      const url = new URL(window.location.href)
      url.searchParams.delete("error")
      url.searchParams.delete("error_description")
      url.searchParams.delete("message")
      window.history.replaceState({}, "", url.pathname + url.search)
    }
  }, [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    setLoading(true)
    try {
      await api.post<{ userId: string }>("/api/v1/auth/login", {
        email,
        password,
      })
      await clearLegacyAuthCookies()
      toast.success("Signed in")
      window.location.assign("/dashboard")
    } catch (err) {
      const msg = mapAuthErrorMessage(err)
      setFormError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#F8FAFC]">
      {/* Tricolor accent — subtle official strip */}
      <div aria-hidden className="absolute inset-x-0 top-0 z-20 flex h-1">
        <span className="h-full flex-1 bg-[#FF9933]" />
        <span className="h-full flex-1 bg-white" />
        <span className="h-full flex-1 bg-[#138808]" />
      </div>

      <div className="grid min-h-svh lg:grid-cols-[1.05fr_0.95fr]">
        {/* Hero panel */}
        <section
          aria-labelledby="login-hero-title"
          className="relative hidden flex-col justify-between overflow-hidden bg-[#0F172A] px-10 py-14 text-white lg:flex xl:px-14"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(3,105,161,0.35),transparent_55%),radial-gradient(ellipse_at_80%_100%,rgba(15,23,42,0.9),transparent_50%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:56px_56px] opacity-[0.04]"
          />

          <div className="relative z-10">
            <div className="flex items-center gap-4">
              <div className="flex size-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-lg ring-2 ring-white/20">
                <Image
                  src="/branding/up-government-logo.png"
                  alt="Uttar Pradesh Government emblem"
                  width={64}
                  height={64}
                  className="size-14 object-contain p-1.5"
                  priority
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.2em] text-sky-200/90 uppercase">
                  Government of Uttar Pradesh
                </p>
                <p className="font-[family-name:var(--font-deva)] text-sm text-sky-100/90">
                  उत्तर प्रदेश सरकार
                </p>
              </div>
            </div>

            <div className="mt-12 max-w-lg">
              <p className="font-[family-name:var(--font-deva)] text-sm font-medium tracking-wide text-sky-200/90">
                {ULB.nameHi} · {ULB.district}
              </p>
              <h1
                id="login-hero-title"
                className="mt-3 font-[family-name:var(--font-auth-display)] text-4xl leading-tight font-semibold tracking-tight text-balance xl:text-[2.75rem]"
              >
                Staff portal
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-slate-200/95">
                Survey, property &amp; payment operations
              </p>
              <p className="mt-2 font-[family-name:var(--font-deva)] text-base leading-relaxed text-slate-300/90">
                स्टाफ पोर्टल — सर्वेक्षण, संपत्ति एवं भुगतान संचालन
              </p>
            </div>
          </div>

          <ul className="relative z-10 mt-10 space-y-4">
            {TRUST_ITEMS.map((item) => (
              <li
                key={item.title}
                className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-colors duration-200 hover:bg-white/[0.08]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-600/20 text-sky-200">
                  <item.icon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {item.title}
                    <span className="mx-2 text-white/30">·</span>
                    <span className="font-[family-name:var(--font-deva)] font-medium text-sky-100/90">
                      {item.titleHi}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-300/85">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <p className="relative z-10 mt-10 text-xs leading-relaxed text-slate-400">
            Official municipal operations portal for {ULB.nameEn}.
            Unauthorized access is prohibited and monitored.
          </p>
        </section>

        {/* Sign-in panel */}
        <section className="relative flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12 xl:px-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(3,105,161,0.08),transparent_45%)] lg:hidden"
          />

          <div className="relative mx-auto w-full max-w-md">
            {/* Mobile header */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-md ring-1 ring-slate-200">
                <Image
                  src="/branding/up-government-logo.png"
                  alt="Uttar Pradesh Government emblem"
                  width={48}
                  height={48}
                  className="size-12 object-contain p-1"
                  priority
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.15em] text-sky-900 uppercase">
                  {ULB.nameEn}
                </p>
                <p className="font-[family-name:var(--font-deva)] text-sm text-slate-600">
                  स्टाफ पोर्टल
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-xl ring-1 shadow-slate-900/[0.06] ring-slate-900/[0.03] backdrop-blur-sm sm:p-8">
              <div className="mb-6 flex items-start gap-3">
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-800 ring-1 ring-sky-100">
                  <Building2 className="size-5" aria-hidden />
                </div>
                <div>
                  <h2 className="font-[family-name:var(--font-auth-display)] text-2xl font-semibold tracking-tight text-[#0F172A]">
                    Sign in
                  </h2>
                  <p className="font-[family-name:var(--font-deva)] text-sm text-slate-600">
                    साइन इन · Staff access only
                  </p>
                </div>
              </div>

              <p className="mb-6 text-sm leading-relaxed text-slate-600">
                Administrator and municipal staff only. Accounts are provisioned
                by a Super Admin — no public registration.
              </p>

              {formError ? (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
                >
                  {formError}
                </div>
              ) : null}

              <form className="space-y-5" onSubmit={onSubmit} noValidate>
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-medium text-[#0F172A]">
                    Email / ईमेल
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11 border-slate-200 bg-slate-50/50 transition-colors duration-200 focus-visible:bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label
                      htmlFor="password"
                      className="font-medium text-[#0F172A]"
                    >
                      Password / पासवर्ड
                    </Label>
                    <Link
                      href="/forgot-password"
                      className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#0369A1] transition-colors duration-200 hover:text-sky-950 hover:underline"
                    >
                      <Lock className="size-3" aria-hidden />
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={12}
                    disabled={loading}
                    className="h-11 border-slate-200 bg-slate-50/50 transition-colors duration-200 focus-visible:bg-white"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    "h-11 w-full cursor-pointer bg-[#0369A1] text-base font-semibold shadow-sm",
                    "transition-colors duration-200 hover:bg-sky-800",
                    "disabled:cursor-not-allowed disabled:opacity-70"
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2
                        className="mr-2 size-4 animate-spin"
                        aria-hidden
                      />
                      Signing in…
                    </>
                  ) : (
                    "Sign in / साइन इन करें"
                  )}
                </Button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
              Need access? Contact your Super Admin to provision a staff
              account.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
