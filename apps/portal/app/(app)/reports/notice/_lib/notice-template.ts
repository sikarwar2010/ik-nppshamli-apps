import { ULB } from "@/lib/ulb-branding"
/**
 * A4 Property Tax Demand Notice — official government-document layout
 * for the configured ULB (lib/ulb-branding.ts). Site imagery and GIS map/coordinates omitted.
 */

type FloorRow = {
  floorLabel: string
  usageType?: string | null
  usageFactor?: string | null
  buildingType?: string | null
  areaSqFt?: string | number | null
  areaSqMeter?: string | number | null
}

export type NoticeFloorCalc = {
  floorLabel: string
  usageType: string
  usageFactor: string
  construction: string
  areaSqFt: number
  rate: number
  alv: number
  tax: number
}

export type NoticeTaxSummary = {
  propertyTaxPct: number
  waterTaxPct: number
  drainageTaxPct: number
  propertyTax: number
  waterTax: number
  drainageTax: number
  totalDemand: number
  annualBaseRate: number | null
  configFound: boolean
  assessmentYear?: string
}

type SurveyData = Record<string, unknown> & {
  surveyId?: string
  ownerName?: string | null
  ownerFatherName?: string | null
  mobile?: string | null
  ward?: { number: number; name: string } | null
  propertyNo?: string | null
  houseNo?: string | null
  parcelNo?: string | null
  propertyUse?: string | null
  taxRateZone?: string | null
  roadType?: string | null
  city?: string | null
  pincode?: string | null
  locality?: string | null
  colony?: string | null
  streetName?: string | null
  floors?: FloorRow[]
}

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

function buildAddress(survey: SurveyData): string {
  const parts = [
    survey.houseNo,
    survey.streetName,
    survey.locality,
    survey.colony,
    survey.city ?? ULB.nameEn,
    survey.pincode,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : "—"
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function currentAssessmentYear(): string {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${year + 1}`
}

function maskMobile(mobile?: string | null): string {
  if (!mobile?.trim()) return "—"
  const digits = mobile.replace(/\D/g, "")
  if (digits.length < 4) return esc(mobile)
  return `XXXXXX${digits.slice(-4)}`
}

function defaultFloorCalcs(floors: FloorRow[]): NoticeFloorCalc[] {
  return floors.map((f) => ({
    floorLabel: f.floorLabel || "—",
    usageType: f.usageType ?? "—",
    usageFactor: f.usageFactor ?? "—",
    construction: f.buildingType ?? "—",
    areaSqFt: Number(f.areaSqFt) || 0,
    rate: 0,
    alv: 0,
    tax: 0,
  }))
}

const DEFAULT_WEBSITE_HOST = ULB.websiteHost

export function generateDemandNoticeHtml(
  survey: SurveyData,
  options?: {
    floors?: NoticeFloorCalc[]
    tax?: NoticeTaxSummary
    assessmentYear?: string
    /** Absolute URL or data URI — required for print popup (about:blank). */
    logoUrl?: string
    /** Public website hostname for payment instructions (e.g. nppshamli.in). */
    websiteDisplayHost?: string
  }
): string {
  const logoUrl = options?.logoUrl?.trim() || "/branding/up-government-logo.png"
  const websiteHost =
    options?.websiteDisplayHost?.trim() || DEFAULT_WEBSITE_HOST
  const rawFloors = (survey.floors ?? []) as FloorRow[]
  const floors =
    options?.floors && options.floors.length > 0
      ? options.floors
      : defaultFloorCalcs(rawFloors)

  const tax: NoticeTaxSummary = options?.tax ?? {
    propertyTaxPct: 10,
    waterTaxPct: 7.5,
    drainageTaxPct: 2.5,
    propertyTax: 0,
    waterTax: 0,
    drainageTax: 0,
    totalDemand: 0,
    annualBaseRate: null,
    configFound: false,
  }

  const assessmentYearLabel =
    options?.assessmentYear?.trim() ||
    tax.assessmentYear?.trim() ||
    currentAssessmentYear()

  const totalArea = floors.reduce((s, f) => s + f.areaSqFt, 0)
  const totalAlv = floors.reduce((s, f) => s + f.alv, 0)
  const totalTax = floors.reduce((s, f) => s + f.tax, 0)

  const floorRows =
    floors.length > 0
      ? floors
          .map(
            (f, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(f.floorLabel)}</td>
        <td>${esc(f.usageType)}</td>
        <td>${esc(f.usageFactor)}</td>
        <td>${esc(f.construction)}</td>
        <td class="r">${money(f.areaSqFt)}</td>
        <td class="r">${f.rate > 0 ? money(f.rate) : "—"}</td>
        <td class="r">${money(f.alv)}</td>
        <td class="r">${money(f.tax)}</td>
      </tr>`
          )
          .join("")
      : `<tr><td colspan="9" class="c muted">No floor data available</td></tr>`

  const baseRateLabel =
    tax.annualBaseRate != null && tax.annualBaseRate > 0
      ? `₹${money(tax.annualBaseRate)}/sqft/mo`
      : "—"

  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<title>Demand Notice - ${esc(survey.surveyId ?? "")}</title>
<style>
/* Exact A4 — print at Scale 100% / Actual size (do not Fit to page) */
@page {
  size: A4 portrait;
  margin: 0;
}
* { margin: 0; padding: 0; box-sizing: border-box; }

html {
  background: #e2e8f0;
}
body {
  font-family: "Segoe UI", "Noto Sans Devanagari", Lato, Tahoma, sans-serif;
  font-size: 10.5px;
  line-height: 1.4;
  color: #020617;
  background: #e2e8f0;
  margin: 0;
  padding: 16px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 210mm;
  height: 297mm;
  margin: 0 auto;
  padding: 10mm 10mm 9mm 10mm;
  background: #fff;
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
}

@media print {
  html, body {
    width: 210mm;
    height: 297mm;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .no-print { display: none !important; }
  .page {
    width: 210mm;
    height: 297mm;
    margin: 0;
    padding: 10mm 10mm 9mm 10mm;
    box-shadow: none;
    page-break-after: avoid;
    page-break-inside: avoid;
  }
}

/* —— Header —— */
.header {
  display: grid;
  grid-template-columns: 120px 1fr 120px;
  align-items: center;
  gap: 12px;
  padding: 2px 0 12px;
  border-bottom: 3px solid #0f172a;
  flex-shrink: 0;
}
.logo {
  width: 116px;
  height: 116px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}
.logo img {
  width: 112px;
  height: 112px;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}
.header-center {
  text-align: center;
  min-width: 0;
  padding: 0 4px;
  overflow-wrap: break-word;
}
.office-en {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.01em;
  line-height: 1.2;
}
.office-loc {
  font-size: 12.5px;
  font-weight: 500;
  color: #334155;
  margin-top: 4px;
  line-height: 1.35;
}
.title-en {
  margin-top: 12px;
  font-size: 24px;
  font-weight: 800;
  color: #0369a1;
  letter-spacing: 0.15px;
  line-height: 1.2;
}
.title-hi {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-top: 6px;
  line-height: 1.45;
}

/* —— Meta —— */
.meta {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  border: 1.5px solid #94a3b8;
  overflow: hidden;
  margin-top: 10px;
  flex-shrink: 0;
}
.meta-cell {
  text-align: center;
  padding: 8px 6px;
  border-right: 1px solid #94a3b8;
  background: #f8fafc;
}
.meta-cell:last-child { border-right: none; }
.meta-label {
  font-size: 8.5px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.45px;
}
.meta-value {
  font-size: 13px;
  font-weight: 800;
  color: #020617;
  margin-top: 3px;
  word-break: break-word;
}

/* —— Specs / Owner —— */
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1.5px solid #94a3b8;
  overflow: hidden;
  margin-top: 10px;
  flex: 0 0 auto;
}
.col { min-width: 0; display: flex; flex-direction: column; }
.col + .col { border-left: 1.5px solid #94a3b8; }
.col-head {
  background: #0f172a;
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.45px;
  text-transform: uppercase;
  padding: 6px 9px;
}
.row {
  display: grid;
  grid-template-columns: 42% 58%;
  border-bottom: 1px solid #e2e8f0;
  flex: 1;
  min-height: 24px;
  align-items: stretch;
}
.row:last-child { border-bottom: none; }
.lbl {
  padding: 5px 8px;
  font-size: 8.5px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.15px;
  background: #f8fafc;
  display: flex;
  align-items: center;
}
.val {
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #020617;
  display: flex;
  align-items: center;
  word-break: break-word;
}

/* —— Section band —— */
.sec {
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
  flex-shrink: 0;
}
.sec.sec-flush { margin-top: 0; }

/* —— ALV table —— */
.alv-wrap {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.alv-scroll {
  width: 100%;
  overflow-x: auto;
  border: 1.5px solid #94a3b8;
  border-top: none;
  flex: 1;
}
table.alv {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
table.alv th {
  background: #0f172a;
  color: #fff;
  font-size: 7.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12px;
  padding: 6px 3px;
  border: 1px solid #1e293b;
  text-align: center;
  line-height: 1.25;
  vertical-align: middle;
}
table.alv td {
  font-size: 10px;
  padding: 5px 4px;
  border: 1px solid #cbd5e1;
  vertical-align: middle;
  word-break: break-word;
}
table.alv td.c, table.alv th.c { text-align: center; }
table.alv td.r {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
table.alv tr.total td {
  font-weight: 800;
  background: #f1f5f9;
  padding: 7px 4px;
  border-top: 2px solid #64748b;
}
.muted { color: #64748b; font-style: italic; }

/* —— Tax summary —— */
.tax-wrap { flex-shrink: 0; }
.tax-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1.25fr;
  border: 1.5px solid #94a3b8;
  border-top: none;
  overflow: hidden;
}
.tax-box {
  text-align: center;
  padding: 10px 5px;
  border-right: 1px solid #94a3b8;
  background: #fff;
}
.tax-box:last-child {
  border-right: none;
  background: #166534;
  color: #fff;
}
.tax-lbl {
  font-size: 8.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.25px;
  color: #475569;
  line-height: 1.3;
}
.tax-box:last-child .tax-lbl { color: #bbf7d0; }
.tax-amt {
  font-size: 15px;
  font-weight: 800;
  margin-top: 5px;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}
.tax-box:last-child .tax-amt {
  font-size: 17px;
  color: #fff;
}

/* —— Important notice —— */
.notice {
  border: 1.5px solid #64748b;
  padding: 8px 10px;
  margin-top: 10px;
  background: #fffbeb;
  flex-shrink: 0;
}
.notice-title {
  font-size: 10.5px;
  font-weight: 800;
  color: #0f172a;
  text-transform: uppercase;
  margin-bottom: 5px;
  letter-spacing: 0.3px;
  padding-bottom: 4px;
  border-bottom: 1px solid #d6d3d1;
}
.notice-body {
  font-size: 9.5px;
  line-height: 1.55;
  color: #0f172a;
  text-align: justify;
}
.notice-body .note {
  margin-top: 5px;
  font-weight: 600;
}
.notice-body .payment-point {
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px dashed #d6d3d1;
  font-weight: 500;
}
.notice-body .site-url {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-weight: 700;
  font-size: 10px;
  color: #0f172a;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* —— Signature —— */
.sig {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 12px;
  flex-shrink: 0;
}
.sig-box { width: 190px; text-align: center; }
.sig-mark { font-size: 11px; font-weight: 700; margin-bottom: 2px; }
.sig-line {
  border-top: 1.5px solid #0f172a;
  margin-top: 28px;
  padding-top: 5px;
}
.sig-en { font-size: 11px; font-weight: 800; }
.sig-hi { font-size: 10px; color: #334155; margin-top: 2px; }

.no-print {
  max-width: 210mm;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.no-print button {
  padding: 10px 22px;
  font-size: 14px;
  cursor: pointer;
  background: #0f172a;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
}
.no-print button:hover { background: #1e293b; }
.no-print .hint {
  font-size: 12px;
  color: #334155;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 12px;
}

@media screen and (max-width: 860px) {
  body { padding: 8px; }
  .page {
    width: 100%;
    max-width: 210mm;
    height: auto;
    min-height: 0;
    overflow: visible;
  }
  .alv-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
}
</style>
</head>
<body>
<div class="no-print">
  <button type="button" onclick="window.print()">Print A4 Notice</button>
  <p class="hint"><strong>Print tip:</strong> Paper = A4 · Scale = <strong>100%</strong> / Actual size · Margins = None · Background graphics = On</p>
</div>

<div class="page">
  <header class="header">
    <div class="logo">
      <img
        src="${esc(logoUrl)}"
        alt="उत्तर प्रदेश सरकार"
        width="112"
        height="112"
      />
    </div>
    <div class="header-center">
      <div class="office-en">Office of ${esc(ULB.nameEn)}</div>
      <div class="office-loc">${esc(ULB.town)}, ${esc(ULB.district)}, ${esc(ULB.state)}</div>
      <div class="title-en">Property Tax Demand Notice</div>
      <div class="title-hi">संपत्ति कर मांग सूचना पत्र</div>
    </div>
    <div aria-hidden="true"></div>
  </header>

  <div class="meta">
    <div class="meta-cell">
      <div class="meta-label">Assessment Year</div>
      <div class="meta-value">${esc(assessmentYearLabel)}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Notice Date</div>
      <div class="meta-value">${esc(formatDate())}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Property ID</div>
      <div class="meta-value">${esc(survey.surveyId ?? "—")}</div>
    </div>
  </div>

  <div class="cols">
    <div class="col">
      <div class="col-head">Property Specifications / संपत्ति विनिर्देश</div>
      <div class="row">
        <div class="lbl">Road Width Zone</div>
        <div class="val">${esc(survey.taxRateZone ?? survey.roadType)}</div>
      </div>
      <div class="row">
        <div class="lbl">Ward No</div>
        <div class="val">Ward No. ${esc(survey.ward?.number ?? "—")}${survey.ward?.name ? ` — ${esc(survey.ward.name)}` : ""}</div>
      </div>
      <div class="row">
        <div class="lbl">Monthly Base Rate</div>
        <div class="val">${esc(baseRateLabel)}</div>
      </div>
      <div class="row">
        <div class="lbl">Old House No</div>
        <div class="val">${esc(survey.houseNo ?? survey.propertyNo)}</div>
      </div>
      <div class="row">
        <div class="lbl">GIS Parcel</div>
        <div class="val">${esc(survey.parcelNo)}</div>
      </div>
      <div class="row">
        <div class="lbl">Property Use</div>
        <div class="val">${esc(survey.propertyUse)}</div>
      </div>
    </div>
    <div class="col">
      <div class="col-head">Owner Profile / स्वामी विवरण</div>
      <div class="row">
        <div class="lbl">Property Owner Name</div>
        <div class="val">${esc(survey.ownerName)}</div>
      </div>
      <div class="row">
        <div class="lbl">Father/Husband Name</div>
        <div class="val">${esc(survey.ownerFatherName)}</div>
      </div>
      <div class="row">
        <div class="lbl">Mobile Number</div>
        <div class="val">${maskMobile(survey.mobile)}</div>
      </div>
      <div class="row">
        <div class="lbl">Address</div>
        <div class="val">${esc(buildAddress(survey))}</div>
      </div>
    </div>
  </div>

  <div class="alv-wrap">
    <div class="sec">Assessment &amp; ALV Calculation Details / मूल्यांकन एवं वार्षिक मूल्यांकन विवरण</div>
    <div class="alv-scroll">
    <table class="alv">
      <thead>
        <tr>
          <th class="c" style="width:5%">S.No</th>
          <th style="width:10%">Floor / तल</th>
          <th style="width:13%">Usage Type / उपयोग प्रकार</th>
          <th style="width:12%">Usage Factor / उपयोग कारक</th>
          <th style="width:13%">Construction / निर्माण</th>
          <th style="width:12%">Area (Sqft) / क्षेत्रफल</th>
          <th style="width:10%">Rate (₹) / दर</th>
          <th style="width:13%">ALV (₹) / वार्षिक मूल्यांकन</th>
          <th style="width:12%">Tax (${esc(tax.propertyTaxPct)}) / कर</th>
        </tr>
      </thead>
      <tbody>
        ${floorRows}
        <tr class="total">
          <td colspan="5" class="r">TOTAL</td>
          <td class="r">${money(totalArea)}</td>
          <td class="r">—</td>
          <td class="r">${money(totalAlv)}</td>
          <td class="r">${money(totalTax)}</td>
        </tr>
      </tbody>
    </table>
    </div>
  </div>

  <div class="tax-wrap">
    <div class="sec sec-flush">Tax Demand Summary / कर मांग सारांश</div>
    <div class="tax-grid">
      <div class="tax-box">
        <div class="tax-lbl">Property Tax (${esc(tax.propertyTaxPct)}%)</div>
        <div class="tax-amt">₹ ${money(tax.propertyTax)}</div>
      </div>
      <div class="tax-box">
        <div class="tax-lbl">Water Tax (${esc(tax.waterTaxPct)}%)</div>
        <div class="tax-amt">₹ ${money(tax.waterTax)}</div>
      </div>
      <div class="tax-box">
        <div class="tax-lbl">Drainage Tax (${esc(tax.drainageTaxPct)}%)</div>
        <div class="tax-amt">₹ ${money(tax.drainageTax)}</div>
      </div>
      <div class="tax-box">
        <div class="tax-lbl">Total Demand / कुल मांग</div>
        <div class="tax-amt">₹ ${money(tax.totalDemand)}</div>
      </div>
    </div>
  </div>

  <div class="notice">
    <div class="notice-title">Important Notice / महत्वपूर्ण सूचना</div>
    <div class="notice-body">
      कृपया नोटिस प्राप्ति के 15 दिवस के अन्दर यदि कोई आपत्ति हो तो पालिका में दाखिल करें। अन्यथा कथित स्थिति में आपकी स्वीकृति मानते हुए उक्त मूल्यांकन दर प्रभावी कर दी जायेगी। वाद मियाद डिमांड कायम करते हुए नगर पालिका अधिनियम 1916 की धारा 141 क 2 के अनुसार शास्ति निर्धारण करते हुए बिल मांग प्रेषित की जायेगी एवं अधिनियम 1916 की धारा 144 एवं भूमि/भवन स्वकर निर्धारण नियमावली 2024 के अन्तर्गत वसूली की जायेगी एवं निर्धारण अवधि में कर जमा करने पर सम्पत्ति कर में छूट एवं निर्धारण अवधि में कर जमा न करने पर ब्याज सहित वसूला जाएगा।
      <div class="note">नोट:- उक्त कर निर्धारण वाद प्रक्रिया हेतु मान्य नहीं होगा एवं कोई भी भवन स्वामी का उक्त प्रक्रिया एवं कर रसीद के स्वामित्व का दावा मान्य नहीं होगा। यदि पूर्व में गृह कर की धन राशि बकाया है तो वह मांग के अनुसार देय होगी।</div>
      <div class="payment-point">${esc(ULB.nameHi)} की वेबसाइट <span class="site-url">${esc(websiteHost)}</span> पर लॉग इन कर अथवा सीधे पालिका काउंटर पर भी सामान्य कर (गृह कर) का भुगतान किया जा सकता है।</div>
    </div>
  </div>

  <div class="sig">
    <div class="sig-box">
      <div class="sig-mark">Sd/-</div>
      <div class="sig-line">
        <div class="sig-en">EXECUTIVE OFFICER</div>
        <div class="sig-hi">अधिशासी अधिकारी</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`
}
