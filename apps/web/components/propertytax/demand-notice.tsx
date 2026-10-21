"use client"

import type { PublicPropertyTaxDues } from "@workspace/types"
import { site } from "@/lib/site"

function money(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function buildAddress(dues: PublicPropertyTaxDues): string {
  const parts = [
    dues.houseNo,
    dues.streetName,
    dues.locality,
    dues.colony,
    dues.city ?? site.identity.nameEn,
    dues.pincode,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : "—"
}

/** Hostname for payment instructions; localhost → the site origin host */
function getWebsiteDisplayHost(): string {
  const fallback = new URL(site.origin).hostname
  const candidates = [
    process.env.NEXT_PUBLIC_CITIZEN_WEB_URL?.trim(),
    typeof window !== "undefined" ? window.location.origin : undefined,
  ]
  for (const raw of candidates) {
    if (!raw) continue
    try {
      const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
      const host = new URL(withProtocol).hostname.toLowerCase()
      if (!host || host === "localhost" || host === "127.0.0.1") continue
      return host
    } catch {
      continue
    }
  }
  return fallback
}

export function DemandNoticeView({ dues }: { dues: PublicPropertyTaxDues }) {
  const floors = dues.floors
  const tax = dues.tax
  const totalArea = floors.reduce((s, f) => s + f.areaSqFt, 0)
  const totalAlv = floors.reduce((s, f) => s + f.alv, 0)
  const totalFloorTax = floors.reduce((s, f) => s + f.tax, 0)
  const baseRateLabel =
    tax.annualBaseRate != null && tax.annualBaseRate > 0
      ? `₹${money(tax.annualBaseRate)}/sqft/mo`
      : "—"
  const websiteHost = getWebsiteDisplayHost()

  return (
    <div className="demand-notice-root">
      <style>{NOTICE_CSS}</style>
      <article className="page">
        <header className="header">
          <div className="logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/up-government-logo.png"
              alt="उत्तर प्रदेश सरकार"
              width={112}
              height={112}
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          </div>
          <div className="header-center">
            <div className="office-en">Office of {site.identity.nameEn}</div>
            <div className="office-loc">
              {site.identity.town}, {site.identity.district}, {site.identity.state}
            </div>
            <div className="title-en">Property Tax Demand Notice</div>
            <div className="title-hi">संपत्ति कर मांग सूचना पत्र</div>
          </div>
          <div className="logo" aria-hidden />
        </header>

        <div className="meta">
          <div className="meta-cell">
            <div className="meta-label">Assessment Year</div>
            <div className="meta-value">{dues.assessmentYear.name}</div>
          </div>
          <div className="meta-cell">
            <div className="meta-label">Survey / Property ID</div>
            <div className="meta-value">{dues.surveyId}</div>
          </div>
          <div className="meta-cell">
            <div className="meta-label">Ward</div>
            <div className="meta-value">
              {String(dues.wardNumber).padStart(2, "0")}
            </div>
          </div>
        </div>

        <div className="cols">
          <div className="col">
            <div className="col-head">
              Property Specifications / संपत्ति विनिर्देश
            </div>
            <div className="row">
              <div className="lbl">Property No.</div>
              <div className="val">{dues.propertyNo || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">GIS Parcel</div>
              <div className="val">{dues.parcelNo || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">Old House No</div>
              <div className="val">{dues.houseNo || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">Address</div>
              <div className="val">{buildAddress(dues)}</div>
            </div>
            <div className="row">
              <div className="lbl">Property Use</div>
              <div className="val">{dues.propertyUse || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">Road Width Zone</div>
              <div className="val">
                {dues.taxRateZone || dues.roadType || "—"}
              </div>
            </div>
          </div>
          <div className="col">
            <div className="col-head">Owner Profile / स्वामी विवरण</div>
            <div className="row">
              <div className="lbl">Property Owner Name</div>
              <div className="val">{dues.ownerName || "—"}</div>
            </div>
            <div className="row">
              <div className="lbl">Mobile Number</div>
              <div className="val">{dues.mobileMasked}</div>
            </div>
            <div className="row">
              <div className="lbl">Ward Name</div>
              <div className="val">{dues.wardName}</div>
            </div>
            <div className="row">
              <div className="lbl">Monthly Base Rate</div>
              <div className="val">{baseRateLabel}</div>
            </div>
            <div className="row">
              <div className="lbl">Config Ver.</div>
              <div className="val">v{dues.taxConfig.version}</div>
            </div>
          </div>
        </div>

        <div className="sec">
          Assessment & ALV Calculation Details / मूल्यांकन एवं वार्षिक मूल्यांकन
          विवरण
        </div>
        <div className="alv-wrap">
          <div className="alv-scroll">
            <table className="alv">
              <thead>
                <tr>
                  <th className="c">S.No</th>
                  <th>Floor / तल</th>
                  <th>Usage Type / उपयोग प्रकार</th>
                  <th>Usage Factor / उपयोग कारक</th>
                  <th>Construction / निर्माण</th>
                  <th className="c">Area (Sqft) / क्षेत्रफल</th>
                  <th className="c">Rate (₹) / दर</th>
                  <th className="c">ALV (₹) / वार्षिक मूल्यांकन</th>
                  <th className="c">Tax ({tax.propertyTaxPct}) / कर</th>
                </tr>
              </thead>
              <tbody>
                {floors.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="c muted">
                      No floor data available
                    </td>
                  </tr>
                ) : (
                  floors.map((f, i) => (
                    <tr key={`${f.floorLabel}-${i}`}>
                      <td className="c">{i + 1}</td>
                      <td>{f.floorLabel}</td>
                      <td>{f.usageType}</td>
                      <td>{f.usageFactor}</td>
                      <td>{f.construction}</td>
                      <td className="r">{money(f.areaSqFt)}</td>
                      <td className="r">{f.rate > 0 ? money(f.rate) : "—"}</td>
                      <td className="r">{money(f.alv)}</td>
                      <td className="r">{money(f.tax)}</td>
                    </tr>
                  ))
                )}
                {floors.length > 0 ? (
                  <tr className="total">
                    <td colSpan={5} className="r">
                      TOTAL
                    </td>
                    <td className="r">{money(totalArea)}</td>
                    <td className="r">—</td>
                    <td className="r">{money(totalAlv)}</td>
                    <td className="r">{money(totalFloorTax)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sec sec-flush">Tax Demand Summary / कर मांग सारांश</div>
        <div className="tax-wrap">
          <div className="tax-grid">
            <div className="tax-box">
              <div className="tax-lbl">
                Property Tax ({tax.propertyTaxPct}%)
              </div>
              <div className="tax-amt">₹{money(tax.propertyTax)}</div>
            </div>
            <div className="tax-box">
              <div className="tax-lbl">Water Tax ({tax.waterTaxPct}%)</div>
              <div className="tax-amt">₹{money(tax.waterTax)}</div>
            </div>
            <div className="tax-box">
              <div className="tax-lbl">
                Drainage Tax ({tax.drainageTaxPct}%)
              </div>
              <div className="tax-amt">₹{money(tax.drainageTax)}</div>
            </div>
            <div className="tax-box">
              <div className="tax-lbl">Total Demand / कुल मांग</div>
              <div className="tax-amt">₹{money(tax.totalDemand)}</div>
            </div>
          </div>
        </div>

        <div className="notice">
          <div className="notice-title">
            Important Notice / महत्वपूर्ण सूचना
          </div>
          <div className="notice-body">
            This is a computer-generated house tax statement based on the
            published municipal tax configuration for the assessment year shown
            above. Please verify particulars with {site.identity.nameEn} before
            making payment. To pay online, use the Pay Online button on this
            page and complete payment through the secure gateway.
            {tax.penalty > 0 ? (
              <div className="note">
                Penalty included: ₹{money(tax.penalty)} ({tax.penaltyPct}%).
              </div>
            ) : null}
            <div className="payment-point">
              {site.identity.nameHi} की वेबसाइट{" "}
              <span className="site-url">{websiteHost}</span> पर लॉग इन कर अथवा
              सीधे कार्यालय काउंटर पर भी सामान्य कर (गृह कर) का भुगतान किया जा
              सकता है।
            </div>
          </div>
        </div>

        <div className="sig">
          <div className="sig-box">
            <div className="sig-mark">Sd/-</div>
            <div className="sig-line" />
            <div className="sig-role">EXECUTIVE OFFICER</div>
            <div className="sig-office">अधिशासी अधिकारी</div>
            <div className="sig-office">{site.identity.nameEn}</div>
          </div>
        </div>
      </article>
    </div>
  )
}

const NOTICE_CSS = `
.demand-notice-root {
  background: #e2e8f0;
  padding: 16px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.demand-notice-root .page {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  padding: 10mm 10mm 9mm 10mm;
  background: #fff;
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  font-family: "Segoe UI", "Noto Sans Devanagari", Lato, Tahoma, sans-serif;
  font-size: 10.5px;
  line-height: 1.4;
  color: #020617;
}
.demand-notice-root .header {
  display: grid;
  grid-template-columns: 120px 1fr 120px;
  align-items: center;
  gap: 12px;
  padding: 2px 0 12px;
  border-bottom: 3px solid #0f172a;
}
.demand-notice-root .logo {
  width: 116px;
  height: 116px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}
.demand-notice-root .logo img {
  width: 112px;
  height: 112px;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}
.demand-notice-root .header-center {
  text-align: center;
  min-width: 0;
  padding: 0 4px;
  overflow-wrap: break-word;
}
.demand-notice-root .office-en {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.01em;
  line-height: 1.2;
}
.demand-notice-root .office-loc {
  font-size: 12.5px;
  font-weight: 500;
  color: #334155;
  margin-top: 4px;
  line-height: 1.35;
}
.demand-notice-root .title-en {
  margin-top: 12px;
  font-size: 24px;
  font-weight: 800;
  color: #0369a1;
  letter-spacing: 0.15px;
  line-height: 1.2;
}
.demand-notice-root .title-hi {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-top: 6px;
  line-height: 1.45;
}
.demand-notice-root .meta {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  border: 1.5px solid #94a3b8;
  overflow: hidden;
  margin-top: 10px;
}
.demand-notice-root .meta-cell {
  text-align: center;
  padding: 8px 6px;
  border-right: 1px solid #94a3b8;
  background: #f8fafc;
}
.demand-notice-root .meta-cell:last-child { border-right: none; }
.demand-notice-root .meta-label {
  font-size: 8.5px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.45px;
}
.demand-notice-root .meta-value {
  font-size: 13px;
  font-weight: 800;
  margin-top: 3px;
  word-break: break-word;
}
.demand-notice-root .cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1.5px solid #94a3b8;
  overflow: hidden;
  margin-top: 10px;
}
.demand-notice-root .col { min-width: 0; }
.demand-notice-root .col + .col { border-left: 1.5px solid #94a3b8; }
.demand-notice-root .col-head {
  background: #0f172a;
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.45px;
  text-transform: uppercase;
  padding: 6px 9px;
}
.demand-notice-root .row {
  display: grid;
  grid-template-columns: 42% 58%;
  border-bottom: 1px solid #e2e8f0;
  min-height: 24px;
  align-items: stretch;
}
.demand-notice-root .row:last-child { border-bottom: none; }
.demand-notice-root .lbl {
  padding: 5px 8px;
  font-size: 8.5px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  background: #f8fafc;
  display: flex;
  align-items: center;
}
.demand-notice-root .val {
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  word-break: break-word;
}
.demand-notice-root .sec {
  background: #e2e8f0;
  border: 1.5px solid #94a3b8;
  border-bottom: none;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  padding: 6px 9px;
  color: #0f172a;
  margin-top: 10px;
}
.demand-notice-root .sec.sec-flush { margin-top: 0; }
.demand-notice-root .alv-wrap { width: 100%; }
.demand-notice-root .alv-scroll {
  width: 100%;
  overflow-x: auto;
  border: 1.5px solid #94a3b8;
  border-top: none;
}
.demand-notice-root table.alv {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.demand-notice-root table.alv th {
  background: #0f172a;
  color: #fff;
  font-size: 7.5px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 6px 3px;
  border: 1px solid #1e293b;
  text-align: center;
  line-height: 1.25;
}
.demand-notice-root table.alv td {
  font-size: 10px;
  padding: 5px 4px;
  border: 1px solid #cbd5e1;
  word-break: break-word;
}
.demand-notice-root table.alv td.c,
.demand-notice-root table.alv th.c { text-align: center; }
.demand-notice-root table.alv td.r {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.demand-notice-root table.alv tr.total td {
  font-weight: 800;
  background: #f1f5f9;
  border-top: 2px solid #64748b;
}
.demand-notice-root .muted { color: #64748b; font-style: italic; }
.demand-notice-root .tax-wrap { flex-shrink: 0; }
.demand-notice-root .tax-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1.25fr;
  border: 1.5px solid #94a3b8;
  border-top: none;
  overflow: hidden;
}
.demand-notice-root .tax-box {
  text-align: center;
  padding: 10px 5px;
  border-right: 1px solid #94a3b8;
  background: #fff;
}
.demand-notice-root .tax-box:last-child {
  border-right: none;
  background: #166534;
  color: #fff;
}
.demand-notice-root .tax-lbl {
  font-size: 8.5px;
  font-weight: 700;
  text-transform: uppercase;
  color: #475569;
  line-height: 1.3;
}
.demand-notice-root .tax-box:last-child .tax-lbl { color: #bbf7d0; }
.demand-notice-root .tax-amt {
  font-size: 15px;
  font-weight: 800;
  margin-top: 5px;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}
.demand-notice-root .tax-box:last-child .tax-amt {
  font-size: 17px;
  color: #fff;
}
.demand-notice-root .notice {
  border: 1.5px solid #64748b;
  padding: 8px 10px;
  margin-top: 10px;
  background: #fffbeb;
}
.demand-notice-root .notice-title {
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 5px;
  letter-spacing: 0.3px;
  padding-bottom: 4px;
  border-bottom: 1px solid #d6d3d1;
}
.demand-notice-root .notice-body {
  font-size: 9.5px;
  line-height: 1.55;
  text-align: justify;
}
.demand-notice-root .notice-body .note {
  margin-top: 5px;
  font-weight: 600;
}
.demand-notice-root .notice-body .payment-point {
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px dashed #d6d3d1;
  font-weight: 500;
}
.demand-notice-root .notice-body .site-url {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-weight: 700;
  font-size: 10px;
  color: #0f172a;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.demand-notice-root .sig {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 12px;
}
.demand-notice-root .sig-box { width: 190px; text-align: center; }
.demand-notice-root .sig-mark {
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 2px;
}
.demand-notice-root .sig-line {
  border-bottom: 1.5px solid #0f172a;
  height: 28px;
  margin-bottom: 5px;
}
.demand-notice-root .sig-role {
  font-size: 11px;
  font-weight: 800;
}
.demand-notice-root .sig-office {
  font-size: 10px;
  color: #334155;
  margin-top: 2px;
}
@media screen and (max-width: 860px) {
  .demand-notice-root { padding: 8px; }
  .demand-notice-root .page {
    width: 100%;
    max-width: 210mm;
    min-height: 0;
  }
  .demand-notice-root .header {
    grid-template-columns: 72px 1fr 72px;
    gap: 8px;
  }
  .demand-notice-root .logo {
    width: 64px;
    height: 64px;
  }
  .demand-notice-root .logo img {
    width: 64px;
    height: 64px;
  }
  .demand-notice-root .office-en { font-size: 18px; }
  .demand-notice-root .office-loc { font-size: 12px; }
  .demand-notice-root .title-en { font-size: 20px; }
  .demand-notice-root .title-hi { font-size: 15px; }
  .demand-notice-root .alv-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
@media screen and (max-width: 480px) {
  .demand-notice-root .header {
    grid-template-columns: 52px 1fr 52px;
    gap: 6px;
  }
  .demand-notice-root .logo {
    width: 48px;
    height: 48px;
  }
  .demand-notice-root .logo img {
    width: 48px;
    height: 48px;
  }
  .demand-notice-root .office-en { font-size: 16px; }
  .demand-notice-root .office-loc { font-size: 11.5px; }
  .demand-notice-root .title-en { font-size: 17px; }
  .demand-notice-root .title-hi { font-size: 14px; }
}
@media print {
  @page { size: A4 portrait; margin: 0; }
  .no-print { display: none !important; }
  .demand-notice-root {
    background: #fff !important;
    padding: 0 !important;
  }
  .demand-notice-root .page {
    box-shadow: none;
    width: 210mm;
    min-height: 297mm;
    margin: 0;
    padding: 10mm 10mm 9mm 10mm;
  }
}
`
