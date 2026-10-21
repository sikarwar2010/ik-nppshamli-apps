import type { SiteConfig } from "./types"

/**
 * Nagar Panchayat Chhata (Mathura). The Chhata site keeps its existing pages
 * (components/about, contact, staff, schemes, …). This config drives the
 * shared layout metadata, property-tax documents and the information
 * architecture adopted from the Shamli reference review (e-services,
 * documents, RTI, notices) — see docs/websites/chhata-ia-from-shamli.md.
 *
 * Facts below come from the existing Chhata pages in this repository.
 * Known inconsistencies are flagged `verified: false` (not rendered).
 */
const REPO = "apps/web/components (existing Chhata pages)"
const REVIEWED = "2026-10-21"

export const chhata: SiteConfig = {
  id: "chhata",
  origin: "https://www.npchhata.com",
  identity: {
    nameEn: "Nagar Panchayat Chhata",
    nameHi: "नगर पंचायत छाता",
    shortName: "Chhata",
    town: "Chhata",
    district: "Mathura",
    state: "Uttar Pradesh",
    tagline: "Clean Chhata, Beautiful Chhata",
    taglineHi: "स्वच्छ छाता, सुंदर छाता",
    logo: { src: "/branding/up-government-logo.png", alt: "Government of Uttar Pradesh emblem" },
  },
  seo: {
    title: "Nagar Panchayat Chhata, Mathura",
    description:
      "Official portal of Nagar Panchayat Chhata, Mathura, Uttar Pradesh. Property tax dues and online payment, citizen services, grievances and public information.",
    keywords: ["Nagar Panchayat Chhata", "नगर पंचायत छाता", "Mathura", "Chhata property tax", "Chhata house tax"],
  },
  contact: {
    // Pincode omitted: existing pages show both 250606 and 281401.
    addressLines: ["Old GT Road, near PWD Guest House", "Chhata, Mathura, Uttar Pradesh"],
    // Existing pages disagree (tel:+918189077892 vs displayed +91 8189077953);
    // this is the displayed number and must be confirmed with the office.
    phones: [{ label: "Office", value: "+91 8189077953", href: "tel:+918189077953" }],
    emails: ["npchhata@gmail.com"],
    source: REPO,
    reviewedOn: REVIEWED,
    verified: false,
  },
  about: {
    introHi: [],
    introEn: [],
    facts: [],
    source: REPO,
    reviewedOn: REVIEWED,
    verified: true,
  },
  publicMessages: [],
  notices: [],
  officials: [],
  // Statewide services adopted from the Shamli reference IA. Only portals that
  // apply to every Uttar Pradesh ULB are listed; no Chhata-specific claims.
  externalServices: [
    {
      id: "property-tax",
      title: "Property (House) Tax",
      titleHi: "सम्पत्ति (गृह) कर",
      description: "Search your property by Property ID, view dues and pay online.",
      href: "/propertytax",
      operator: "Nagar Panchayat Chhata",
    },
    {
      id: "birth-death",
      title: "Birth & Death Registration",
      titleHi: "जन्म / मृत्यु पंजीकरण",
      description: "Civil Registration System of the Registrar General of India.",
      href: "http://crsorgi.gov.in/web/index.php/auth/login",
      operator: "Office of the Registrar General, India",
    },
    {
      id: "igrs",
      title: "Property & Marriage Registration",
      titleHi: "सम्पत्ति / विवाह पंजीकरण",
      description: "Stamp & Registration Department, Uttar Pradesh (IGRS).",
      href: "https://igrsup.gov.in/igrsup/defaultAction.action",
      operator: "Stamp & Registration Department, Uttar Pradesh",
    },
    {
      id: "jansunwai",
      title: "Jansunwai – Grievance Redressal",
      titleHi: "जनसुनवाई – समाधान",
      description: "Integrated Grievance Redressal System of the Government of Uttar Pradesh.",
      href: "https://jansunwai.up.nic.in/",
      operator: "Government of Uttar Pradesh",
    },
  ],
  documents: {
    items: [],
    note: "Budgets, audit reports and other public documents will be listed here once provided by the Nagar Panchayat.",
    source: REPO,
    reviewedOn: REVIEWED,
    verified: true,
  },
  rti: {
    guidanceHi: [
      "सूचना का अधिकार अधिनियम, 2005 के अन्तर्गत कोई भी नागरिक लिखित रूप में या इलेक्ट्रॉनिक माध्यम से लोक सूचना अधिकारी को आवेदन दे सकता है।",
      "सूचना माँगने का कारण बताना आवश्यक नहीं है; निर्धारित शुल्क जमा करना होता है।",
    ],
    officerNote:
      "Public Information Officer details have not yet been published here. Please contact the Nagar Panchayat office.",
  },
  grievance: {
    channels: [
      {
        title: "Jansunwai (IGRS, Uttar Pradesh)",
        description: "Register and track a complaint with the State's official grievance system.",
        href: "https://jansunwai.up.nic.in/",
      },
      { title: "Nagar Panchayat office", description: "Use the Public Grievance page or contact the office.", href: "/public-grievance" },
    ],
  },
  nav: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Services", href: "/services" },
    { label: "e-Services", href: "/e-services" },
    { label: "Notices", href: "/notices" },
    { label: "Documents", href: "/documents" },
    { label: "RTI", href: "/rti" },
    { label: "Public Grievance", href: "/public-grievance" },
    { label: "Contact", href: "/contact" },
    { label: "House Tax", href: "/propertytax" },
  ],
}

export default chhata
