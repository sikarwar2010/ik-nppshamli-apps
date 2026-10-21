import { Loader2, Lock } from "lucide-react"
import Link from "next/link"

import type { PublicPropertyTaxDues } from "@workspace/types"

import {
  formatHouseTaxMoney,
  isHouseTaxPayable,
} from "@/lib/property-tax-format"
import { site } from "@/lib/site"

type TaxSummaryCardProps = {
  dues: PublicPropertyTaxDues
  /** When set, shows Pay Online as link to pay step */
  payHref?: string
  /** When set with onPayClick, renders submit-style button instead of link */
  onPayClick?: () => void
  payPending?: boolean
  payDisabled?: boolean
  showPayAction?: boolean
  compact?: boolean
  className?: string
}

function BreakdownRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <li
      className={`flex items-center justify-between gap-4 ${strong
          ? "border-t border-slate-200 pt-3 font-bold text-slate-950"
          : "text-slate-700"
        }`}
    >
      <span className={strong ? "text-sm" : "text-sm"}>{label}</span>
      <span className="tabular-nums text-sm">{value}</span>
    </li>
  )
}

export function TaxBreakdownList({ dues }: { dues: PublicPropertyTaxDues }) {
  const tax = dues.tax
  return (
    <ul className="space-y-2" aria-label="Tax breakdown">
      <BreakdownRow
        label={`Property Tax (${tax.propertyTaxPct}%)`}
        value={`₹${formatHouseTaxMoney(tax.propertyTax)}`}
      />
      <BreakdownRow
        label={`Water Tax (${tax.waterTaxPct}%)`}
        value={`₹${formatHouseTaxMoney(tax.waterTax)}`}
      />
      <BreakdownRow
        label={`Drainage Tax (${tax.drainageTaxPct}%)`}
        value={`₹${formatHouseTaxMoney(tax.drainageTax)}`}
      />
      {tax.penalty > 0 ? (
        <BreakdownRow
          label={`Penalty (${tax.penaltyPct}%)`}
          value={`₹${formatHouseTaxMoney(tax.penalty)}`}
        />
      ) : null}
      <BreakdownRow
        label="Total Demand"
        value={`₹${formatHouseTaxMoney(tax.totalDemand)}`}
        strong
      />
    </ul>
  )
}

export function TaxSummaryCard({
  dues,
  payHref,
  onPayClick,
  payPending = false,
  payDisabled = false,
  showPayAction = true,
  compact = false,
  className = "",
}: TaxSummaryCardProps) {
  const payable = isHouseTaxPayable(dues)
  const alreadyPaid = dues.paidForAssessmentYear

  return (
    <section
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
      aria-labelledby="amount-payable-heading"
    >
      <div className="bg-gov-blue-dark px-5 py-6 text-white sm:px-6">
        <p
          id="amount-payable-heading"
          className="text-xs font-bold tracking-wider text-white/90 uppercase"
        >
          Total Amount Payable
        </p>
        <p
          className={`mt-2 font-extrabold tracking-tight tabular-nums ${compact ? "text-3xl" : "text-4xl sm:text-5xl"
            }`}
        >
          ₹{formatHouseTaxMoney(dues.tax.totalDemand)}
        </p>
        <p className="mt-2 text-sm text-white/80">
          Assessment Year: {dues.assessmentYear.name}
        </p>
      </div>

      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <p className="mb-3 text-xs font-bold tracking-wider text-slate-500 uppercase">
          Tax Summary
        </p>
        <TaxBreakdownList dues={dues} />
      </div>

      {showPayAction ? (
        <div className="no-print px-5 py-4 sm:px-6">
          {payable && payHref && !onPayClick ? (
            <Link
              href={payHref}
              className="bg-gov-saffron hover:bg-gov-saffron-dark focus-visible:ring-gov-saffron inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
            >
              Pay Online
            </Link>
          ) : null}

          {payable && onPayClick ? (
            <button
              type="submit"
              onClick={onPayClick}
              disabled={payDisabled || payPending}
              className="bg-gov-saffron hover:bg-gov-saffron-dark focus-visible:ring-gov-saffron inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none"
            >
              {payPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Lock className="h-4 w-4" aria-hidden />
              )}
              <span>
                {payPending ? "Proceeding to payment..." : "Pay Online"}
              </span>
            </button>
          ) : null}

          {!payable && alreadyPaid ? (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
            >
              No payment is currently due.
              <span className="mt-1 block font-normal text-emerald-800/90">
                Assessment year {dues.assessmentYear.name} has already been paid.
              </span>
            </div>
          ) : null}

          {!payable && !alreadyPaid ? (
            <div
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
            >
              Online payment is not available for this property yet.
              <span className="mt-1 block font-normal text-amber-900/80">
                Published tax rates may be missing or set to zero. Please contact
                {site.identity.nameEn}.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
