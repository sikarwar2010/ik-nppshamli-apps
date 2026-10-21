"use client"

import { Building, ChevronDown, FileSpreadsheet, Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

interface MenuItem {
  name: string
  href: string
  hasDropdown?: boolean
  megaMenuType?: "departments" | "services" | null
  items?: { name: string; href: string }[]
}

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()

  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeTab, setActiveTab] = useState("Home")
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 120) {
        setScrolled(true)
      } else {
        setScrolled(false)
      }
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  // Update active tab based on path
  useEffect(() => {
    if (pathname === "/public-grievance") setActiveTab("Public Grievance")
    else if (pathname === "/schemes") setActiveTab("Schemes")
    else if (pathname === "/gallery") setActiveTab("Gallery")
    else if (pathname === "/contact") setActiveTab("Contact")
    else if (pathname === "/about") setActiveTab("About")
    else if (pathname === "/departments") setActiveTab("Departments")
    else if (pathname === "/services") setActiveTab("Services")
    // else if (pathname === '/newsandnotice') setActiveTab('News And Notice');
    else if (pathname === "/propertytax") setActiveTab("House Tax")
    else if (pathname === "/staff") setActiveTab("Staff")
    else setActiveTab("Home")
  }, [pathname])

  const menuItems: MenuItem[] = [
    { name: "Home", href: "/", hasDropdown: false },
    { name: "About", href: "/about", hasDropdown: false },
    {
      name: "Departments",
      href: "/departments",
      hasDropdown: false,
      megaMenuType: "departments",
    },
    {
      name: "Services",
      href: "/services",
      hasDropdown: true,
      megaMenuType: "services",
    },
    { name: "Public Grievance", href: "/public-grievance", hasDropdown: false },
    { name: "Schemes", href: "/schemes", hasDropdown: false },
    // Adopted from the Shamli reference IA (docs/websites/chhata-ia-from-shamli.md).
    { name: "e-Services", href: "/e-services", hasDropdown: false },
    { name: "Notices", href: "/notices", hasDropdown: false },
    { name: "Documents", href: "/documents", hasDropdown: false },
    { name: "RTI", href: "/rti", hasDropdown: false },
    { name: "Gallery", href: "/gallery", hasDropdown: false },
    { name: "Staff", href: "/staff", hasDropdown: false },
    { name: "Contact", href: "/contact", hasDropdown: false },
    { name: "House Tax", href: "/propertytax", hasDropdown: false },
  ]

  const departments = [
    {
      name: "Public Works Department",
      desc: "Municipal road infrastructure, civil projects",
    },
    {
      name: "Revenue Department",
      desc: "Taxation collection, trade license billing",
    },
    {
      name: "Water Supply Department",
      desc: "Clean drinking water distribution & connections",
    },
    {
      name: "Sanitation Department",
      desc: "Waste management, waste disposal & hygiene",
    },
    {
      name: "Health Department",
      desc: "Birth/death verification, community medicine",
    },
    {
      name: "Engineering Department",
      desc: "Town planning, building construction safety",
    },
  ]

  const services = [
    {
      name: "Online House Tax Payment",
      desc: "Submit yearly property & house dues",
      href: "/propertytax",
    },
    {
      name: "Water Connection Request",
      desc: "Request tap supply configuration",
      href: "/services",
    },
    {
      name: "Birth Certificate Portal",
      desc: "Verify and apply for municipal birth register",
      href: "/services",
    },
    {
      name: "Death Registration Desk",
      desc: "Verify or register unfortunate demises",
      href: "/services",
    },
    {
      name: "Trade License Portal",
      desc: "Verify or renew local industry certificates",
      href: "/services",
    },
    {
      name: "Building Permission Desk",
      desc: "Submit blueprints for structural review",
      href: "/services",
    },
    {
      name: "RTI Filings Section",
      desc: "Request administrative information updates",
      href: "/services",
    },
    {
      name: "Grievance Redressal Desk",
      desc: "File complain ticket for civic issues",
      href: "/public-grievance",
    },
  ] as const

  const handleMenuClick = (name: string, href: string) => {
    setActiveTab(name)
    setIsOpen(false)
    setOpenDropdown(null)

    // If it's a homepage anchor
    if (href.includes("#")) {
      const targetId = href.split("#")[1]
      if (!targetId) {
        router.push(href)
        return
      }
      if (pathname === "/") {
        const element = document.getElementById(targetId)
        if (element) {
          const offset = scrolled ? 80 : 140
          const elementPosition =
            element.getBoundingClientRect().top + window.scrollY
          window.scrollTo({
            top: elementPosition - offset,
            behavior: "smooth",
          })
        }
      } else {
        router.push(href)
      }
    } else {
      router.push(href)
    }
  }

  return (
    <nav
      className={`sticky top-0 z-50 w-full transition-all duration-300 print:hidden ${
        scrolled
          ? "bg-gov-blue-dark/95 border-gov-blue-medium border-b py-2.5 shadow-lg backdrop-blur-sm"
          : "bg-gov-blue-medium py-3.5"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 md:px-8">
        {/* Shortened Brand name visible only when scrolled */}
        <Link
          href="/"
          className={`flex items-center gap-2 text-white transition-all duration-300 ${
            scrolled
              ? "translate-x-0 opacity-100"
              : "pointer-events-none w-0 -translate-x-4 overflow-hidden opacity-0"
          }`}
        >
          <img
            src="https://cdn.s3waas.gov.in/s30336dcbab05b9d5ad24f4333c7658a0e/uploads/2018/02/2018021632.png"
            alt="Government Emblem"
            className="h-12 w-12 shrink-0 rounded-full bg-white object-contain p-1"
          />
          <div className="text-left leading-none">
            <span className="text-gov-saffron block text-[10px] font-bold uppercase">
              Chhata Portal
            </span>
            <span className="block text-xs font-extrabold tracking-wide uppercase">
              Nagar Panchayat, Chhata , Mathura
            </span>
          </div>
        </Link>

        {/* Desktop Menu links */}
        <div className="mx-auto hidden items-center space-x-1 lg:flex">
          {menuItems.map((item) => {
            const isActive = activeTab === item.name
            const isDropdownOpen = openDropdown === item.name

            return (
              <div
                key={item.name}
                className="group relative"
                onMouseEnter={() =>
                  item.hasDropdown && setOpenDropdown(item.name)
                }
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <button
                  suppressHydrationWarning
                  onClick={() => handleMenuClick(item.name, item.href)}
                  className={`flex cursor-pointer items-center gap-1 rounded-md px-3 py-2 text-xs font-bold tracking-wide uppercase transition-all ${
                    isActive
                      ? "bg-gov-saffron text-white shadow-sm"
                      : "text-slate-100 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span>{item.name}</span>
                  {item.hasDropdown && <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {/* Dropdown Menu (Standard Layout) */}
                {item.hasDropdown && !item.megaMenuType && isDropdownOpen && (
                  <div className="animate-fade-in absolute left-0 z-50 mt-0 w-56 rounded-lg border border-slate-100 bg-white py-2 shadow-xl">
                    {item.items?.map((sub) => (
                      <button
                        key={sub.name}
                        onClick={() => handleMenuClick(item.name, sub.href)}
                        className="hover:bg-gov-blue-light hover:text-gov-blue-dark w-full cursor-pointer border-0 px-4 py-2 text-left text-xs font-semibold text-slate-700 transition-all"
                      >
                        {sub.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Mega Menu Layout for Departments & Services */}
                {item.hasDropdown && item.megaMenuType && isDropdownOpen && (
                  <div className="fixed top-[inherit] right-0 left-0 z-50 mx-auto max-w-7xl px-4">
                    <div className="animate-scale-up mt-1 grid grid-cols-3 gap-6 rounded-xl border border-slate-100 bg-white p-6 shadow-2xl">
                      {/* Left highlight box */}
                      <div className="from-gov-blue-dark to-gov-blue-medium flex flex-col justify-between rounded-lg bg-linear-to-br p-5 text-left text-white">
                        <div>
                          <h4 className="text-gov-saffron mb-2 text-sm font-extrabold tracking-wider uppercase">
                            {item.name} gateway
                          </h4>
                          <p className="text-xs leading-relaxed text-slate-200">
                            Nagar Panchayat, Chhata , Mathura Administrative
                            services are unified online. Browse details,
                            download documents, and apply securely.
                          </p>
                        </div>
                        <div className="mt-4 border-t border-white/10 pt-4 text-[10px] font-bold tracking-widest text-slate-300 uppercase">
                          Government of Uttar Pradesh
                        </div>
                      </div>

                      {/* Right list grid */}
                      <div className="col-span-2 grid grid-cols-2 gap-4">
                        {(item.megaMenuType === "departments"
                          ? departments
                          : services
                        ).map((subItem) => (
                          <button
                            key={subItem.name}
                            onClick={() =>
                              handleMenuClick(
                                item.name,
                                "href" in subItem && subItem.href
                                  ? subItem.href
                                  : item.href
                              )
                            }
                            className="hover:border-gov-blue-medium group flex cursor-pointer items-start gap-3 rounded-lg border border-slate-50 p-3 text-left transition-all hover:bg-slate-50"
                          >
                            <div className="bg-gov-blue-light text-gov-blue-medium group-hover:bg-gov-saffron shrink-0 rounded p-2 transition-colors group-hover:text-white">
                              {item.megaMenuType === "departments" ? (
                                <Building className="h-4 w-4" />
                              ) : (
                                <FileSpreadsheet className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <p className="group-hover:text-gov-blue-dark font-sans text-xs font-bold text-slate-800 transition-colors">
                                {subItem.name}
                              </p>
                              <p className="mt-0.5 line-clamp-1 font-sans text-[10px] text-slate-400">
                                {subItem.desc}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Mobile menu trigger */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="hover:text-gov-saffron cursor-pointer p-1 text-white transition-colors lg:hidden"
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* ================================================= */}
      {/* MOBILE DRAWER NAVIGATION                         */}
      {/* ================================================= */}

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-gov-blue-dark animate-slide-in relative ml-auto flex h-full w-4/5 max-w-sm transform flex-col justify-between overflow-y-auto p-6 shadow-2xl transition-transform duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close menu"
              className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Logo in drawer */}
            <div className="space-y-6 pt-10">
              <div className="flex items-center gap-2 border-b border-slate-700 pb-4">
                <svg
                  className="h-8 w-8"
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="48"
                    stroke="#FF9933"
                    strokeWidth="4"
                    fill="#0A2540"
                  />
                  <path
                    d="M35 50 L65 50 M50 35 L50 65"
                    stroke="#FFFFFF"
                    strokeWidth="4"
                  />
                </svg>
                <div className="text-left leading-none">
                  <span className="block text-xs font-bold text-white uppercase">
                    Chhata Portal
                  </span>
                  <span className="text-gov-saffron block text-[10px]">
                    Portal Menu
                  </span>
                </div>
              </div>

              {/* Menu lists */}
              <div className="space-y-1">
                {menuItems.map((item) => {
                  const isActive = activeTab === item.name
                  const hasSub = item.hasDropdown
                  const isDropdownOpen = openDropdown === item.name

                  return (
                    <div
                      key={item.name}
                      className="border-b border-slate-800/40 py-1 text-left"
                    >
                      <button
                        onClick={() => {
                          if (hasSub) {
                            setOpenDropdown(isDropdownOpen ? null : item.name)
                          } else {
                            handleMenuClick(item.name, item.href)
                          }
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-lg border-0 px-3 py-2 text-xs font-bold tracking-wide uppercase transition-colors ${
                          isActive
                            ? "bg-gov-saffron text-white"
                            : "text-slate-200 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span>{item.name}</span>
                        {hasSub && (
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                          />
                        )}
                      </button>

                      {/* Mobile Dropdown Subitems */}
                      {hasSub && isDropdownOpen && (
                        <div className="mt-1 space-y-1 rounded-lg bg-black/10 py-2 pl-4">
                          {item.megaMenuType === "departments" &&
                            departments.map((dept) => (
                              <button
                                key={dept.name}
                                onClick={() =>
                                  handleMenuClick(item.name, item.href)
                                }
                                className="w-full border-0 bg-transparent px-3 py-1.5 text-left text-[11px] font-semibold text-slate-300 hover:text-white"
                              >
                                • {dept.name}
                              </button>
                            ))}

                          {item.megaMenuType === "services" &&
                            services.map((serv) => (
                              <button
                                key={serv.name}
                                onClick={() =>
                                  handleMenuClick(item.name, serv.href)
                                }
                                className="w-full border-0 bg-transparent px-3 py-1.5 text-left text-[11px] font-semibold text-slate-300 hover:text-white"
                              >
                                • {serv.name}
                              </button>
                            ))}

                          {item.items &&
                            item.items.map((sub) => (
                              <button
                                key={sub.name}
                                onClick={() =>
                                  handleMenuClick(item.name, sub.href)
                                }
                                className="w-full border-0 bg-transparent px-3 py-1.5 text-left text-[11px] font-semibold text-slate-300 hover:text-white"
                              >
                                • {sub.name}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Bottom contact info inside drawer */}
            <div className="mt-8 border-t border-slate-700/60 pt-4 text-center">
              <p className="text-[10px] text-slate-400">Emergency Helpline</p>
              <a
                href="tel:18001804040"
                className="text-gov-saffron block text-sm font-extrabold hover:underline"
              >
                1800-180-4040
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
