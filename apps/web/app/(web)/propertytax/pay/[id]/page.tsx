"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useRef, useState, type FormEvent } from "react"

import { PaymentProcessSteps } from "@/components/propertytax/payment-process-steps"
import { PropertySummaryCard } from "@/components/propertytax/property-summary-card"
import {
  TaxBreakdownList,
  TaxSummaryCard,
} from "@/components/propertytax/tax-summary-card"
import { openAtomAipayCheckout } from "@/lib/atom-checkout"
import { isHouseTaxPayable } from "@/lib/property-tax-format"
import { citizenPayErrorMessage } from "@/lib/property-tax-pay-errors"
import {
  createPublicPropertyTaxPayment,
  fetchPublicPropertyDues,
} from "@/lib/property-tax-api"
import { PublicApiError } from "@/lib/public-api"
import { site } from "@/lib/site"

export default function PropertyTaxPayPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params.id === "string" ? params.id : ""

  const [mobile, setMobile] = useState("")
  const [email, setEmail] = useState("")
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [checkoutStarted, setCheckoutStarted] = useState(false)
  const submittedRef = useRef(false)

  const duesQuery = useQuery({
    queryKey: ["public-property-tax-dues", id],
    queryFn: () => fetchPublicPropertyDues(id),
    enabled: Boolean(id),
    retry: false,
  })

  const payMutation = useMutation({
    mutationFn: () =>
      createPublicPropertyTaxPayment({
        surveyId: id,
        payerMobile: mobile,
        payerEmail: email.trim() || undefined,
      }),
    onSuccess: async (data) => {
      try {
        setCheckoutStarted(true)
        if (data.checkout?.mode === "aipay") {
          await openAtomAipayCheckout(data.checkout)
          return
        }
        if (data.redirectUrl) {
          window.location.assign(data.redirectUrl)
          return
        }
        submittedRef.current = false
        setCheckoutStarted(false)
        setFieldError("Unable to initiate payment. Please try again.")
      } catch (err) {
        submittedRef.current = false
        setCheckoutStarted(false)
        setFieldError(citizenPayErrorMessage(err))
      }
    },
    onError: () => {
      submittedRef.current = false
      setCheckoutStarted(false)
    },
  })

  const dues = duesQuery.data
  const alreadyPaid = dues?.paidForAssessmentYear === true
  const payable = dues != null && isHouseTaxPayable(dues)
  const loadError =
    duesQuery.error instanceof PublicApiError
      ? duesQuery.error.message
      : duesQuery.isError
        ? "Unable to load tax dues for this property."
        : null
  const payError = payMutation.isError
    ? citizenPayErrorMessage(payMutation.error)
    : null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFieldError(null)
    if (!/^\d{10}$/.test(mobile)) {
      setFieldError("Enter a valid 10-digit mobile number.")
      return
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError("Enter a valid email address or leave it blank.")
      return
    }
    if (!payable || payMutation.isPending || submittedRef.current) return
    submittedRef.current = true
    payMutation.mutate()
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <PaymentProcessSteps current={3} className="mb-6" />

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-gov-saffron-dark text-xs font-bold tracking-wide uppercase">
              Online House Tax
            </p>
            <h1 className="text-gov-blue-dark mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Online House Tax Payment
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Confirm the amount fixed by published municipal rates, then
              continue to the payment gateway.
            </p>
          </div>
          <Link
            href={id ? `/propertytax/dues/${id}` : "/propertytax"}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors duration-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dues
          </Link>
        </div>

        {duesQuery.isLoading ? (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-20 text-slate-600 shadow-sm">
            <Loader2 className="text-gov-saffron h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading payable amount…</span>
          </div>
        ) : null}

        {loadError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center shadow-sm"
          >
            <p className="text-sm font-semibold text-red-900">{loadError}</p>
            <Link
              href="/propertytax"
              className="text-gov-saffron-dark mt-4 inline-flex cursor-pointer text-sm font-bold hover:underline"
            >
              Return to property search
            </Link>
          </div>
        ) : null}

        {dues ? (
          <div className="space-y-6">
            <TaxSummaryCard dues={dues} showPayAction={false} />
            <PropertySummaryCard dues={dues} />

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-gov-blue-dark text-base font-bold tracking-tight">
                Tax Summary
              </h2>
              <div className="mt-4">
                <TaxBreakdownList dues={dues} />
              </div>
            </section>

            {!payable ? (
              <div
                role="alert"
                className={`rounded-xl border px-6 py-6 text-sm shadow-sm ${
                  alreadyPaid
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-amber-200 bg-amber-50 text-amber-950"
                }`}
              >
                {alreadyPaid ? (
                  <>
                    <p className="font-semibold">
                      No payment is currently due.
                    </p>
                    <p className="mt-1 opacity-80">
                      House tax for assessment year {dues.assessmentYear.name}{" "}
                      has already been paid. You can print your receipt from the
                      payment success page if you have the transaction id.
                    </p>
                    <Link
                      href="/propertytax"
                      className="mt-4 inline-flex cursor-pointer text-sm font-bold text-emerald-800 underline-offset-2 hover:underline"
                    >
                      Return to property search
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">
                      Online payment is not available for this property yet.
                    </p>
                    <p className="mt-1 text-amber-900/80">
                      Published tax rates may be missing or set to zero. Please
                      contact {site.identity.nameEn} or try again after rates are
                      updated.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
              >
                <h2 className="text-gov-blue-dark text-lg font-extrabold tracking-tight">
                  Payer details
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Enter a mobile number for payment confirmation. Email is
                  optional.
                </p>

                <div className="border-gov-saffron/20 bg-gov-orange-light mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm text-slate-800">
                  <ShieldCheck className="text-gov-saffron-dark mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    This is an official {site.identity.nameEn} house tax
                    payment. The amount is fixed by published rates and cannot
                    be changed.
                  </p>
                </div>

                <div className="mt-6 space-y-5">
                  <div>
                    <label
                      htmlFor="payer-mobile"
                      className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wider text-slate-700 uppercase"
                    >
                      <Phone className="text-gov-saffron h-3.5 w-3.5" />
                      Mobile number (required)
                    </label>
                    <input
                      id="payer-mobile"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      autoComplete="tel"
                      value={mobile}
                      onChange={(e) =>
                        setMobile(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="10-digit mobile number"
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={
                        fieldError || payError ? "pay-form-error" : undefined
                      }
                      className="focus:border-gov-saffron focus:ring-gov-saffron/15 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 placeholder-slate-400 shadow-inner transition-all duration-200 focus:bg-white focus:ring-4 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="payer-email"
                      className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wider text-slate-700 uppercase"
                    >
                      <Mail className="text-gov-saffron h-3.5 w-3.5" />
                      Email (optional)
                    </label>
                    <input
                      id="payer-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="focus:border-gov-saffron focus:ring-gov-saffron/15 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 placeholder-slate-400 shadow-inner transition-all duration-200 focus:bg-white focus:ring-4 focus:outline-none"
                    />
                  </div>
                </div>

                {fieldError || payError ? (
                  <p
                    id="pay-form-error"
                    role="alert"
                    className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                  >
                    {fieldError || payError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={payMutation.isPending || checkoutStarted}
                  className="bg-gov-saffron hover:bg-gov-saffron-dark focus-visible:ring-gov-saffron mt-6 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl px-8 py-4 text-sm font-bold text-white transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {payMutation.isPending || checkoutStarted ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Lock className="h-4 w-4" aria-hidden />
                  )}
                  <span>
                    {payMutation.isPending || checkoutStarted
                      ? "Proceeding to payment..."
                      : "Pay Online"}
                  </span>
                </button>

                <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <CheckCircle2 className="text-gov-green h-3.5 w-3.5" />
                  You will be redirected to the municipal payment gateway
                </p>
              </form>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
