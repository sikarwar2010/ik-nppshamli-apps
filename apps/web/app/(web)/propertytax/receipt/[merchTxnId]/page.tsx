"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Download, Loader2, Printer } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { PaymentProcessSteps } from "@/components/propertytax/payment-process-steps"
import { PaymentReceiptView } from "@/components/propertytax/payment-receipt"
import { fetchPublicPaymentReceipt } from "@/lib/property-tax-api"
import { PublicApiError } from "@/lib/public-api"
import { site } from "@/lib/site"

export default function PropertyTaxReceiptPage() {
  const params = useParams<{ merchTxnId: string }>()
  const merchTxnId =
    typeof params.merchTxnId === "string"
      ? decodeURIComponent(params.merchTxnId)
      : ""

  const receiptQuery = useQuery({
    queryKey: ["public-property-tax-receipt", merchTxnId],
    queryFn: () => fetchPublicPaymentReceipt(merchTxnId),
    enabled: Boolean(merchTxnId),
    retry: false,
  })

  const errorMessage =
    receiptQuery.error instanceof PublicApiError
      ? receiptQuery.error.message
      : receiptQuery.isError
        ? "Receipt is not available for this transaction."
        : null

  const receipt = receiptQuery.data
  const isSuccess = receipt?.status === "SUCCESS"

  function handlePrint() {
    window.print()
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="no-print mx-auto max-w-7xl px-4 pt-8 pb-4 sm:px-6 lg:px-8">
        <PaymentProcessSteps current={4} className="mb-6" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-gov-saffron-dark text-xs font-bold tracking-wide uppercase">
              Online House Tax · Receipt
            </p>
            <h1 className="text-gov-blue-dark mt-1 text-2xl font-extrabold tracking-tight">
              {isSuccess ? "Payment Successful" : "Payment receipt"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Official online house tax payment receipt for {site.identity.nameEn}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/propertytax"
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors duration-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to search
            </Link>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!isSuccess}
              aria-label="Download receipt — use Save as PDF in the print dialog"
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors duration-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download Receipt
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!isSuccess}
              className="bg-gov-saffron hover:bg-gov-saffron-dark focus-visible:ring-gov-saffron inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" aria-hidden />
              Print Receipt
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {receiptQuery.isLoading ? (
          <div className="no-print flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-20 text-slate-600 shadow-sm">
            <Loader2 className="text-gov-saffron h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading receipt…</span>
          </div>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="no-print rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center shadow-sm"
          >
            <p className="text-sm font-semibold text-red-900">{errorMessage}</p>
            {merchTxnId ? (
              <Link
                href={`/propertytax/payment/return?merchTxnId=${encodeURIComponent(merchTxnId)}`}
                className="text-gov-saffron-dark mt-4 inline-flex cursor-pointer text-sm font-bold hover:underline"
              >
                Check payment status
              </Link>
            ) : null}
          </div>
        ) : null}

        {receipt && !isSuccess ? (
          <div
            role="alert"
            className="no-print rounded-xl border border-amber-200 bg-amber-50 px-6 py-10 text-center shadow-sm"
          >
            <p className="text-sm font-semibold text-amber-950">
              This receipt is only available after a successful payment.
            </p>
            <p className="mt-2 text-sm text-amber-900/80">
              Current status: {receipt.status}. Please check payment status or
              contact the municipal office.
            </p>
            {merchTxnId ? (
              <Link
                href={`/propertytax/payment/return?merchTxnId=${encodeURIComponent(merchTxnId)}`}
                className="text-gov-saffron-dark mt-4 inline-flex cursor-pointer text-sm font-bold hover:underline"
              >
                Check payment status
              </Link>
            ) : null}
          </div>
        ) : null}

        {receipt && isSuccess ? (
          <PaymentReceiptView receipt={receipt} />
        ) : null}
      </div>
    </div>
  )
}
