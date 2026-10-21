"use client"

import { CheckCircle2 } from "lucide-react"
import Image from "next/image"

import type { PublicPropertyTaxReceipt } from "@workspace/types"
import { site } from "@/lib/site"

function money(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

function displayName(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : "—"
}

export function PaymentReceiptView({
  receipt,
}: {
  receipt: PublicPropertyTaxReceipt
}) {
  const wardLabel =
    receipt.wardNumber != null
      ? `${String(receipt.wardNumber).padStart(2, "0")} · ${receipt.wardName ?? ""}`.trim()
      : "—"

  return (
    <div className="receipt-root">
      <style>{RECEIPT_CSS}</style>
      <article className="page" aria-label="Property tax payment receipt">
        <header className="header">
          <div className="logo">
            <Image
              src="/branding/up-government-logo.png"
              alt="Government of Uttar Pradesh emblem"
              width={72}
              height={72}
              className="logo-img"
              priority
            />
          </div>
          <div className="header-center">
            <p className="state-line">Government of Uttar Pradesh</p>
            <h1 className="office-en">
              {`${site.identity.nameEn}, ${site.identity.district}`.toUpperCase()}
            </h1>
            <p className="office-loc">
              {site.identity.district} District · {site.identity.state}, India
            </p>
            <div className="title-block">
              <h2 className="title-en">Property Tax Payment Receipt</h2>
              <p className="title-hi">सम्पत्ति कर भुगतान रसीद</p>
            </div>
          </div>
          <div className="logo seal-side" aria-hidden>
            <Image
              src="/branding/up-government-logo.png"
              alt=""
              width={64}
              height={64}
              className="logo-img muted"
            />
          </div>
        </header>

        <div className="status-banner" role="status">
          <CheckCircle2 className="status-icon" aria-hidden />
          <span>PAYMENT SUCCESSFUL</span>
          <span className="status-hi">भुगतान सफल</span>
        </div>

        <section className="meta" aria-label="Receipt summary">
          <div className="meta-cell">
            <div className="meta-label">Receipt No.</div>
            <div className="meta-value">
              {receipt.receiptNumber || receipt.merchTxnId || "—"}
            </div>
          </div>
          <div className="meta-cell">
            <div className="meta-label">Paid on</div>
            <div className="meta-value">{formatWhen(receipt.paidAt)}</div>
          </div>
          <div className="meta-cell highlight">
            <div className="meta-label">Amount paid</div>
            <div className="meta-value amount">₹{money(receipt.amount)}</div>
          </div>
        </section>

        <section className="owner-band" aria-label="Assessee details">
          <div className="owner-band-label">Assessee / Owner</div>
          <div className="owner-grid">
            <div className="owner-field">
              <span className="owner-lbl">Owner name</span>
              <span className="owner-val">
                {displayName(receipt.ownerName)}
              </span>
            </div>
            <div className="owner-field">
              <span className="owner-lbl">
                Father&apos;s / Husband&apos;s name
              </span>
              <span className="owner-val">
                {displayName(receipt.ownerFatherName)}
              </span>
            </div>
          </div>
        </section>

        <div className="cols">
          <section className="col" aria-label="Transaction details">
            <div className="col-head">Transaction</div>
            <div className="row">
              <div className="lbl">Merchant Txn ID</div>
              <div className="val">{receipt.merchTxnId || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">Gateway Txn ID</div>
              <div className="val">{receipt.atomTxnId || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">Gateway</div>
              <div className="val">{receipt.gateway || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">Currency</div>
              <div className="val">{receipt.currency}</div>
            </div>
            <div className="row">
              <div className="lbl">Payer mobile</div>
              <div className="val">{receipt.payerMobileMasked}</div>
            </div>
          </section>

          <section className="col" aria-label="Property details">
            <div className="col-head">Property</div>
            <div className="row">
              <div className="lbl">Survey / Property ID</div>
              <div className="val">{receipt.surveyId || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">Property No.</div>
              <div className="val">{receipt.propertyNo || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">Parcel No.</div>
              <div className="val">{receipt.parcelNo || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">Ward</div>
              <div className="val">{wardLabel}</div>
            </div>
            <div className="row">
              <div className="lbl">Assessment Year</div>
              <div className="val">{receipt.assessmentYear || "—"}</div>
            </div>
          </section>
        </div>

        {receipt.taxBreakdown ? (
          <section className="breakdown" aria-label="Tax components">
            <div className="col-head">Tax components (at payment)</div>
            <table>
              <tbody>
                <tr>
                  <td>Property tax</td>
                  <td className="num">
                    ₹{money(receipt.taxBreakdown.propertyTax)}
                  </td>
                </tr>
                <tr>
                  <td>Water tax</td>
                  <td className="num">
                    ₹{money(receipt.taxBreakdown.waterTax)}
                  </td>
                </tr>
                <tr>
                  <td>Drainage tax</td>
                  <td className="num">
                    ₹{money(receipt.taxBreakdown.drainageTax)}
                  </td>
                </tr>
                <tr>
                  <td>Penalty</td>
                  <td className="num">
                    ₹{money(receipt.taxBreakdown.penalty)}
                  </td>
                </tr>
                <tr className="total">
                  <td>Total demand</td>
                  <td className="num">
                    ₹{money(receipt.taxBreakdown.totalDemand)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        ) : null}

        <footer className="footer">
          <p>
            This is a computer-generated official receipt for online property
            tax payment to {site.identity.nameEn}. No signature is required.
          </p>
          <p className="footer-hi">
            यह {site.identity.nameHi} के लिए ऑनलाइन सम्पत्ति कर भुगतान की
            कम्प्यूटर-जनित आधिकारिक रसीद है।
          </p>
        </footer>
      </article>
    </div>
  )
}

const RECEIPT_CSS = `
.receipt-root {
  color: #0f172a;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
}
.receipt-root .page {
  max-width: 920px;
  margin: 0 auto;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 28px 32px 32px;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.07);
}
.receipt-root .header {
  display: grid;
  grid-template-columns: 80px 1fr 80px;
  gap: 14px;
  align-items: center;
  border-bottom: 3px solid #c2410c;
  padding-bottom: 18px;
}
.receipt-root .logo {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.receipt-root .logo-img {
  width: 72px;
  height: 72px;
  object-fit: contain;
}
.receipt-root .logo-img.muted {
  opacity: 0.92;
  width: 64px;
  height: 64px;
}
.receipt-root .header-center { text-align: center; }
.receipt-root .state-line {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #334155;
}
.receipt-root .office-en {
  margin: 4px 0 0;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: #0f172a;
  line-height: 1.25;
}
.receipt-root .office-loc {
  margin: 4px 0 0;
  font-size: 12px;
  color: #475569;
  font-weight: 500;
}
.receipt-root .title-block {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}
.receipt-root .title-en {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #9a3412;
  letter-spacing: 0.01em;
}
.receipt-root .title-hi {
  margin: 4px 0 0;
  font-size: 14px;
  color: #c2410c;
  font-weight: 600;
}
.receipt-root .status-banner {
  margin: 18px 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #065f46;
  background: linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%);
  border: 1px solid #6ee7b7;
  border-radius: 6px;
  padding: 10px 16px;
}
.receipt-root .status-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.receipt-root .status-hi {
  font-weight: 700;
  letter-spacing: 0.02em;
  opacity: 0.9;
}
.receipt-root .meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}
.receipt-root .meta-cell {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px 14px;
  background: #f8fafc;
}
.receipt-root .meta-cell.highlight {
  background: #fff7ed;
  border-color: #fdba74;
}
.receipt-root .meta-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #475569;
}
.receipt-root .meta-value {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  word-break: break-word;
}
.receipt-root .meta-value.amount {
  color: #9a3412;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
.receipt-root .owner-band {
  margin-bottom: 14px;
  border: 1px solid #fdba74;
  border-radius: 6px;
  overflow: hidden;
  background: #fffbeb;
}
.receipt-root .owner-band-label {
  background: #c2410c;
  color: #fff7ed;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 14px;
}
.receipt-root .owner-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}
.receipt-root .owner-field {
  padding: 14px 16px;
  border-right: 1px solid #fed7aa;
}
.receipt-root .owner-field:last-child { border-right: 0; }
.receipt-root .owner-lbl {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #9a3412;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.receipt-root .owner-val {
  display: block;
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.35;
  word-break: break-word;
}
.receipt-root .cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.receipt-root .col {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}
.receipt-root .col-head {
  background: #fff7ed;
  color: #9a3412;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 9px 12px;
  border-bottom: 1px solid #fed7aa;
}
.receipt-root .row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px;
  padding: 9px 12px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 12px;
}
.receipt-root .row:last-child { border-bottom: 0; }
.receipt-root .lbl { color: #475569; font-weight: 600; }
.receipt-root .val { font-weight: 700; color: #0f172a; word-break: break-word; }
.receipt-root .breakdown {
  margin-top: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
}
.receipt-root .breakdown table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.receipt-root .breakdown td {
  padding: 10px 14px;
  border-top: 1px solid #f1f5f9;
  color: #0f172a;
}
.receipt-root .breakdown .num {
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.receipt-root .breakdown tr.total td {
  background: #fff7ed;
  font-weight: 800;
  color: #9a3412;
  border-top: 1px solid #fed7aa;
}
.receipt-root .footer {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px dashed #cbd5e1;
  font-size: 11px;
  color: #475569;
  text-align: center;
  line-height: 1.55;
}
.receipt-root .footer p { margin: 0; }
.receipt-root .footer-hi {
  margin-top: 6px !important;
  color: #64748b;
}
@media (max-width: 720px) {
  .receipt-root .page { padding: 20px 16px 24px; }
  .receipt-root .header {
    grid-template-columns: 64px 1fr;
  }
  .receipt-root .seal-side { display: none; }
  .receipt-root .office-en { font-size: 14px; }
  .receipt-root .title-en { font-size: 17px; }
  .receipt-root .meta { grid-template-columns: 1fr; }
  .receipt-root .owner-grid { grid-template-columns: 1fr; }
  .receipt-root .owner-field {
    border-right: 0;
    border-bottom: 1px solid #fed7aa;
  }
  .receipt-root .owner-field:last-child { border-bottom: 0; }
  .receipt-root .cols { grid-template-columns: 1fr; }
  .receipt-root .row { grid-template-columns: 1fr; gap: 2px; }
}
@media (prefers-reduced-motion: reduce) {
  .receipt-root * { transition: none !important; }
}
@media print {
  .no-print { display: none !important; }
  .receipt-root .page {
    border: 0;
    box-shadow: none;
    border-radius: 0;
    max-width: none;
    padding: 0;
  }
  .receipt-root .status-banner {
    background: #fff !important;
    border: 1px solid #065f46;
  }
  .receipt-root .owner-band-label {
    background: #fff !important;
    color: #9a3412 !important;
    border-bottom: 2px solid #c2410c;
  }
}
`
