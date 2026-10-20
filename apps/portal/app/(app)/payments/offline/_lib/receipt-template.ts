/**
 * A4 Property Tax Payment Receipt for counter / offline collection.
 * Matches municipal demand-notice visual language.
 */

import type { StaffPaymentReceipt } from "@workspace/types"
import { ULB } from "@/lib/ulb-branding"

function esc(value: unknown): string {
  const s = String(value ?? "—")
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

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

function formatMode(mode: string): string {
  switch (mode) {
    case "CASH":
      return "Cash"
    case "CHEQUE":
      return "Cheque"
    case "DD":
      return "Demand Draft"
    case "UPI_MANUAL":
      return "UPI (Manual)"
    case "OTHER":
      return "Other"
    case "ONLINE":
      return "Online"
    default:
      return mode
  }
}

function wardLabel(receipt: StaffPaymentReceipt): string {
  if (!receipt.ward) return "—"
  return `${String(receipt.ward.number).padStart(2, "0")} · ${receipt.ward.name}`
}

export function generateOfflinePaymentReceiptHtml(
  receipt: StaffPaymentReceipt,
  options?: { logoUrl?: string }
): string {
  const logoUrl = options?.logoUrl?.trim() || "/branding/up-government-logo.png"
  const survey = receipt.survey
  const printedAt = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<title>Payment Receipt - ${esc(receipt.receiptNumber)}</title>
<style>
@page {
  size: A4 portrait;
  margin: 0;
}
* { margin: 0; padding: 0; box-sizing: border-box; }

html { background: #e2e8f0; }
body {
  font-family: "Segoe UI", "Noto Sans Devanagari", Lato, Tahoma, sans-serif;
  font-size: 11px;
  line-height: 1.45;
  color: #020617;
  background: #e2e8f0;
  margin: 0;
  padding: 16px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  padding: 12mm 11mm 11mm 11mm;
  background: #fff;
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
}

@media print {
  html, body {
    width: 210mm;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .no-print { display: none !important; }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0;
    padding: 12mm 11mm 11mm 11mm;
    box-shadow: none;
  }
}

.header {
  display: grid;
  grid-template-columns: 88px 1fr 88px;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 3px solid #0f172a;
}
.logo {
  width: 84px; height: 84px;
  display: flex; align-items: center; justify-content: center;
}
.logo img {
  width: 84px; height: 84px;
  object-fit: contain;
  display: block;
}
.header-center { text-align: center; }
.office-en { font-size: 14px; font-weight: 700; color: #0f172a; }
.office-loc { font-size: 11px; color: #334155; margin-top: 2px; }
.title-en {
  margin-top: 8px; font-size: 18px; font-weight: 800;
  color: #0369a1; letter-spacing: 0.2px;
}
.title-hi { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px; }

.status-banner {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #047857;
  background: #ecfdf5;
  border: 1.5px solid #6ee7b7;
  border-radius: 4px;
  padding: 8px 12px;
}

.meta {
  display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;
  border: 1.5px solid #94a3b8; border-radius: 4px; overflow: hidden;
  margin-top: 12px;
}
.meta-cell {
  text-align: center; padding: 10px 8px;
  border-right: 1px solid #94a3b8; background: #f8fafc;
}
.meta-cell:last-child { border-right: none; }
.meta-label {
  font-size: 9px; font-weight: 700; color: #475569;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.meta-value { font-size: 13px; font-weight: 800; color: #020617; margin-top: 4px; word-break: break-word; }
.meta-value.amount { color: #0369a1; font-size: 16px; }

.cols {
  display: grid; grid-template-columns: 1fr 1fr;
  border: 1.5px solid #94a3b8; border-radius: 4px; overflow: hidden;
  margin-top: 12px;
}
.col { min-width: 0; display: flex; flex-direction: column; }
.col + .col { border-left: 1.5px solid #94a3b8; }
.col-head {
  background: #0f172a; color: #fff;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  padding: 8px 12px;
}
.row {
  display: grid; grid-template-columns: 130px 1fr;
  gap: 8px; padding: 7px 12px;
  border-bottom: 1px solid #e2e8f0; font-size: 12px;
}
.row:last-child { border-bottom: 0; }
.lbl { color: #64748b; font-weight: 600; }
.val { font-weight: 700; word-break: break-word; }

.payment-box {
  margin-top: 12px;
  border: 1.5px solid #94a3b8;
  border-radius: 4px;
  overflow: hidden;
}
.received {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
}
.thanks {
  margin-top: 4px;
  text-align: center;
  font-size: 12px;
  color: #334155;
}

.sign-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-top: 36px;
  padding-top: 8px;
}
.sign-block { text-align: center; }
.sign-line {
  border-top: 1px solid #64748b;
  margin: 40px 24px 8px;
}
.sign-label { font-size: 11px; font-weight: 700; color: #334155; }

.footer {
  margin-top: auto;
  padding-top: 16px;
  font-size: 10px;
  color: #64748b;
  text-align: center;
  line-height: 1.5;
  border-top: 1px solid #e2e8f0;
}
</style>
</head>
<body>
  <article class="page">
    <header class="header">
      <div class="logo">
        <img src="${esc(logoUrl)}" alt="Uttar Pradesh Government" />
      </div>
      <div class="header-center">
        <div class="office-en">${esc(`${ULB.nameEn}, ${ULB.district}`.toUpperCase())}</div>
        <div class="office-loc">Uttar Pradesh, India</div>
        <div class="title-en">Property Tax Payment Receipt</div>
        <div class="title-hi">सम्पत्ति कर भुगतान रसीद</div>
      </div>
      <div class="logo" aria-hidden="true"></div>
    </header>

    <div class="status-banner">PAYMENT RECEIVED</div>

    <div class="meta">
      <div class="meta-cell">
        <div class="meta-label">Receipt No.</div>
        <div class="meta-value">${esc(receipt.receiptNumber)}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-label">Payment Ref.</div>
        <div class="meta-value">${esc(receipt.paymentReference)}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-label">Collected on</div>
        <div class="meta-value">${esc(formatWhen(receipt.collectionDate))}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-label">Amount Paid</div>
        <div class="meta-value amount">₹${money(receipt.amount)}</div>
      </div>
    </div>

    <div class="cols">
      <div class="col">
        <div class="col-head">Assessee / Owner</div>
        <div class="row">
          <div class="lbl">Owner name</div>
          <div class="val">${esc(survey?.ownerName ?? receipt.payerName)}</div>
        </div>
        <div class="row">
          <div class="lbl">Father / Husband</div>
          <div class="val">${esc(survey?.ownerFatherName)}</div>
        </div>
        <div class="row">
          <div class="lbl">Mobile</div>
          <div class="val">${esc(survey?.mobile ?? receipt.payerMobile)}</div>
        </div>
        <div class="row">
          <div class="lbl">Address</div>
          <div class="val">${esc(survey?.address)}</div>
        </div>
        <div class="row">
          <div class="lbl">Payer (if different)</div>
          <div class="val">${esc(
            receipt.payerName &&
              survey?.ownerName &&
              receipt.payerName.trim() !== survey.ownerName.trim()
              ? `${receipt.payerName}${receipt.payerMobile ? ` · ${receipt.payerMobile}` : ""}`
              : "—"
          )}</div>
        </div>
      </div>
      <div class="col">
        <div class="col-head">Property</div>
        <div class="row">
          <div class="lbl">Survey / Property ID</div>
          <div class="val">${esc(survey?.surveyId)}</div>
        </div>
        <div class="row">
          <div class="lbl">Property No.</div>
          <div class="val">${esc(survey?.propertyNo)}</div>
        </div>
        <div class="row">
          <div class="lbl">Parcel No.</div>
          <div class="val">${esc(survey?.parcelNo)}</div>
        </div>
        <div class="row">
          <div class="lbl">House No.</div>
          <div class="val">${esc(survey?.houseNo)}</div>
        </div>
        <div class="row">
          <div class="lbl">Ward</div>
          <div class="val">${esc(wardLabel(receipt))}</div>
        </div>
        <div class="row">
          <div class="lbl">Property use</div>
          <div class="val">${esc(survey?.propertyUse)}</div>
        </div>
        <div class="row">
          <div class="lbl">Zone / Road</div>
          <div class="val">${esc(
            [survey?.taxRateZone, survey?.roadType]
              .filter(Boolean)
              .join(" · ") || null
          )}</div>
        </div>
      </div>
    </div>

    <div class="payment-box">
      <div class="col-head">Payment details</div>
      <div class="row">
        <div class="lbl">Mode</div>
        <div class="val">${esc(formatMode(receipt.paymentMode))}</div>
      </div>
      <div class="row">
        <div class="lbl">Cheque / DD / UPI ref.</div>
        <div class="val">${esc(receipt.chequeDdReference)}</div>
      </div>
      <div class="row">
        <div class="lbl">Collected by</div>
        <div class="val">${esc(receipt.collectedBy?.name)}</div>
      </div>
      <div class="row">
        <div class="lbl">Currency</div>
        <div class="val">${esc(receipt.currency)}</div>
      </div>
      <div class="row">
        <div class="lbl">Remarks</div>
        <div class="val">${esc(receipt.remarks)}</div>
      </div>
      <div class="row">
        <div class="lbl">Amount received</div>
        <div class="val">₹${money(receipt.amount)}</div>
      </div>
    </div>

    <div class="received">Received with thanks — ₹${money(receipt.amount)}</div>
    <div class="thanks">धन्यवाद · Computer-generated municipal receipt</div>

    <div class="sign-row">
      <div class="sign-block">
        <div class="sign-line"></div>
        <div class="sign-label">Collector / Clerk</div>
      </div>
      <div class="sign-block">
        <div class="sign-line"></div>
        <div class="sign-label">Executive Officer</div>
      </div>
    </div>

    <footer class="footer">
      This receipt confirms offline / counter collection of property tax by
      ${esc(ULB.nameEn)}, ${esc(ULB.district)}. Retain for your records.<br />
      Printed: ${esc(printedAt)}
    </footer>
  </article>
</body>
</html>`
}

export async function printOfflinePaymentReceipt(
  receipt: StaffPaymentReceipt
): Promise<boolean> {
  const logoUrl = `${window.location.origin}/branding/up-government-logo.png`
  const html = generateOfflinePaymentReceiptHtml(receipt, { logoUrl })
  const w = window.open("", "_blank")
  if (!w) return false
  w.document.write(html)
  w.document.close()
  w.focus()
  const imgs = Array.from(w.document.images)
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.onload = () => resolve()
          img.onerror = () => resolve()
        })
    )
  )
  w.print()
  return true
}
