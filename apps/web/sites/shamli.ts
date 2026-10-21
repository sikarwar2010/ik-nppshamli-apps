import type { DocumentLink, SiteConfig } from "./types"

import documents from "./shamli-documents.json"

/**
 * Nagar Palika Parishad Shamli — content sourced from the municipality's
 * existing official website (https://nppshamli.in, reviewed 2026-10-21 with
 * scripts/site-inventory). See docs/websites/shamli-content-review.md for
 * what was withheld and why.
 */
const REF = "https://nppshamli.in"
const REVIEWED = "2026-10-21"

export const shamli: SiteConfig = {
  id: "shamli",
  origin: "https://nppshamli.in",
  identity: {
    nameEn: "Nagar Palika Parishad Shamli",
    nameHi: "नगर पालिका परिषद शामली",
    shortName: "Shamli",
    town: "Shamli",
    district: "Shamli",
    state: "Uttar Pradesh",
    logo: { src: "/branding/up-government-logo.png", alt: "Government of Uttar Pradesh emblem" },
  },
  seo: {
    title: "Nagar Palika Parishad Shamli",
    description:
      "Official information portal of Nagar Palika Parishad Shamli, Uttar Pradesh — property (house) tax dues and online payment, citizen e-services, budgets and reports, RTI and grievance channels.",
    keywords: [
      "Nagar Palika Parishad Shamli",
      "नगर पालिका परिषद शामली",
      "Shamli property tax",
      "Shamli house tax",
      "Shamli municipal services",
    ],
  },
  contact: {
    // Office lines published on the official contact page. The executive
    // officer's personal mobile number is intentionally not republished.
    phones: [
      { label: "Office", value: "01398-250049", href: "tel:+911398250049" },
      { label: "Fax", value: "01398-250054", href: "tel:+911398250054" },
    ],
    emails: ["nppshamli@gmail.com"],
    source: `${REF}/contact.aspx`,
    reviewedOn: REVIEWED,
    verified: true,
  },
  about: {
    introHi: [
      "नगर पालिका परिषद शामली पश्चिमी उत्तर प्रदेश का एक प्रगतिशील एवं विकासोन्मुख नगर है। मान्यता है कि द्वापर युग में भगवान श्रीकृष्ण हस्तिनापुर से कुरुक्षेत्र जाते समय इसी मार्ग से गए थे; कालांतर में इस नगरी का नाम श्यामवाली, फिर श्यामनगरी और वर्तमान में शामली हो गया।",
      "कैराना रोड स्थित 13वीं सदी का सिद्धपीठ गुलज़ारी वाला मन्दिर तथा महाभारत एवं मराठा कालीन संस्कृति को समेटे प्राचीन सिद्धपीठ हनुमान टीला नगर के प्रमुख धार्मिक स्थल हैं। इसके अतिरिक्त बरखण्डी वाला, आट्ठे वाला देवी मन्दिर, दासी वाला एवं सदाशिव वाला मन्दिर भी स्थापित हैं।",
      "नगर में सन् 1933 में स्थापित अपर दोआब शुगर मिल स्थित है। चारों ओर कृषि-बाहुल्य क्षेत्र होने के कारण शामली ने व्यावसायिक, औद्योगिक तथा शिक्षा के क्षेत्र में उल्लेखनीय प्रगति की है।",
    ],
    introEn: [
      "Shamli is a progressive, developing town of western Uttar Pradesh, located on the Delhi–Saharanpur highway about 100 km from Delhi and 65 km from Saharanpur.",
      "The town is home to the Upper Doab Sugar Mill, established in 1933, and to historic temples including the Gulzari Wala Mandir on Kairana Road and the Hanuman Tila.",
    ],
    facts: [
      { label: "Location", value: "29.45° N, 77.32° E" },
      { label: "Average elevation", value: "248 m (813 ft)" },
      { label: "Distance from Delhi", value: "about 100 km" },
      { label: "Upper Doab Sugar Mill", value: "established 1933" },
    ],
    source: `${REF}/Abouts.aspx; ${REF}/statistics.aspx`,
    reviewedOn: REVIEWED,
    verified: true,
  },
  publicMessages: [
    "नगर को स्वच्छ रखना हम सभी का दायित्व है।",
    "कूड़ा केवल कूड़ेदान में डालें।",
    "पाँच साल के बच्चों को पोलियो की खुराक अवश्य पिलवाएँ।",
    "सार्वजनिक स्थानों पर धूम्रपान न करें।",
    "जल ही जीवन है, इसका सही उपयोग करें।",
  ].map((text) => ({ text, source: REF, reviewedOn: REVIEWED, verified: true })),
  // The reference site's notices and tenders pages return HTTP 500, so there
  // is no verified notice to publish yet. Add entries here once approved.
  notices: [],
  // The reference site lists a 2020-era board (20 members) while the portal
  // now has 25 wards — withheld until the current board is confirmed.
  officials: [],
  externalServices: [
    {
      id: "property-tax",
      title: "Property (House) Tax",
      titleHi: "सम्पत्ति (गृह) कर",
      description: "Search your property by Property ID, view dues and pay online.",
      href: "/propertytax",
      operator: "Nagar Palika Parishad Shamli",
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
      id: "e-nagarsewa",
      title: "e-Nagarsewa Online Payment",
      titleHi: "ई-नगरसेवा ऑनलाइन भुगतान",
      description: "Uttar Pradesh urban local bodies payment portal (e.g. sewerage tax).",
      href: "http://e-nagarsewaup.gov.in/onlinepay/",
      operator: "Government of Uttar Pradesh",
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
      id: "e-suvidha",
      title: "e-Suvidha Shamli",
      titleHi: "ई-सुविधा शामली",
      description: "Citizen facilitation portal listed on the municipality's website.",
      href: "http://shamli.onlineesuvidha.co.in/",
      operator: "Third-party service listed by the municipality",
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
    items: documents as DocumentLink[],
    note: "Documents are currently hosted on the existing nppshamli.in server. Copy them before the domain is switched to this site (see docs/websites/README.md).",
    source: `${REF}/Budget.aspx; ${REF}/amrut.aspx`,
    reviewedOn: REVIEWED,
    verified: true,
  },
  rti: {
    guidanceHi: [
      "सूचना का अधिकार अधिनियम, 2005 के अन्तर्गत कोई भी नागरिक लिखित रूप में या इलेक्ट्रॉनिक माध्यम से हिन्दी, अंग्रेज़ी अथवा क्षेत्रीय भाषा में लोक सूचना अधिकारी को आवेदन दे सकता है।",
      "सूचना माँगने का कारण बताना आवश्यक नहीं है; निर्धारित शुल्क जमा करना होता है।",
      "नागरिक कार्यों, दस्तावेज़ों व अभिलेखों का निरीक्षण कर सकते हैं, उनकी प्रमाणित प्रतियाँ प्राप्त कर सकते हैं तथा इलेक्ट्रॉनिक रूप में सूचना प्राप्त कर सकते हैं।",
    ],
    officerNote:
      "The current Public Information Officer details have not yet been published here. Please contact the municipal office for the PIO and appellate authority.",
  },
  grievance: {
    channels: [
      {
        title: "Jansunwai (IGRS, Uttar Pradesh)",
        description: "Register and track a complaint with the State's official grievance system.",
        href: "https://jansunwai.up.nic.in/",
      },
      {
        title: "Municipal office",
        description: "Call or write to the Nagar Palika Parishad office (details on the Contact page).",
        href: "/contact",
      },
    ],
  },
  nav: [
    { label: "Home", labelHi: "मुख्य पृष्ठ", href: "/" },
    { label: "About", labelHi: "पालिका को जानें", href: "/about" },
    { label: "Property Tax", labelHi: "गृह कर", href: "/propertytax" },
    { label: "e-Services", labelHi: "ई-सेवाएँ", href: "/services" },
    { label: "Notices", labelHi: "सूचना", href: "/notices" },
    { label: "Budget & Reports", labelHi: "बजट-ऑडिट", href: "/documents" },
    { label: "RTI", labelHi: "सूचना का अधिकार", href: "/rti" },
    { label: "Grievance", labelHi: "शिकायत", href: "/public-grievance" },
    { label: "Contact", labelHi: "संपर्क", href: "/contact" },
  ],
}

export default shamli
