import AboutUs from "@/components/about/page"
import ContactUs from "@/components/contact/page"
import DepartmentsPage from "@/components/departments/page"
import GalleryPage from "@/components/gallery/page"
import AnnouncementTicker from "@/components/home/AnnouncementTicker"
import ChairmanMessage from "@/components/home/ChairmanMessage"
import CitizenServices from "@/components/home/CitizenServices"
import Complain from "@/components/home/complain"
import DigitalGateway from "@/components/home/DigitalGateway"
import DignitariesSection from "@/components/home/dignitariesSection"
import Galleryslider from "@/components/home/galleryslider"
import HeroSlider from "@/components/home/HeroSlider"
import Portals from "@/components/home/portals"
import Statistics from "@/components/home/Statistics"
import Footer from "@/components/navigation/Footer"
import Header from "@/components/navigation/Header"
import Navbar from "@/components/navigation/Navbar"
import TopUtilityBar from "@/components/navigation/TopUtilityBar"
import PublicGrievance from "@/components/public-grievance/page"
import SchemesPage from "@/components/schemes/page"
import ServicesPage from "@/components/services/page"
import StaffPage from "@/components/staff/page"

import type { SiteVariant } from "./types"

function ChhataHeader() {
  return (
    <>
      <TopUtilityBar />
      <Header />
      <Navbar />
    </>
  )
}

function ChhataHome() {
  return (
    <div className="flex min-h-screen flex-col">
      <HeroSlider />
      <AnnouncementTicker />
      <div className="bg-gradient-flag">
        <DigitalGateway />
        <CitizenServices />
        <ChairmanMessage />
      </div>
      <Statistics />
      <DignitariesSection />
      <Portals />
      <Galleryslider />
      <Complain />
    </div>
  )
}

/** Nagar Panchayat Chhata: existing pages + IA routes adopted from the Shamli review. */
const variant: SiteVariant = {
  Header: ChhataHeader,
  Footer,
  Home: ChhataHome,
  About: AboutUs,
  Contact: ContactUs,
  Services: ServicesPage,
  Grievance: PublicGrievance,
  Departments: DepartmentsPage,
  Schemes: SchemesPage,
  Staff: StaffPage,
  Gallery: GalleryPage,
  extraPaths: ["/departments", "/schemes", "/staff", "/gallery"],
}

export default variant
