import type { Metadata } from "next"
import { Geist } from "next/font/google"

import QueryProvider from "@/components/providers/query-providers"
import { site } from "@/lib/site"
import { cn } from "@/lib/utils"

import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  metadataBase: new URL(site.origin),
  title: { default: site.seo.title, template: `%s | ${site.identity.nameEn}` },
  description: site.seo.description,
  keywords: site.seo.keywords,
  applicationName: site.identity.nameEn,
  openGraph: {
    type: "website",
    siteName: site.identity.nameEn,
    title: site.seo.title,
    description: site.seo.description,
    locale: "en_IN",
    url: site.origin,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className="flex min-h-screen flex-col bg-white text-slate-800">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
