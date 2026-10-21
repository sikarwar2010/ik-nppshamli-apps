import variant from "@site/variant"

import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { MotionProvider } from "@/components/providers/motion-providers"

export default function WebLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <variant.Header />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <MotionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </MotionProvider>
      </main>
      <variant.Footer />
    </>
  )
}
