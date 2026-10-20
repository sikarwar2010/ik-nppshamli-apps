import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { ApiUnavailablePanel } from "@/components/api-unavailable-panel"
import { RouteAccessGate } from "@/components/route-access-gate"
import { PermissionProvider } from "@/hooks/use-permission"
import { fetchCurrentUser } from "@/lib/server-session"

export const dynamic = "force-dynamic"

export default async function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await fetchCurrentUser()
  if (session.status === "unauthenticated") {
    redirect("/login?signedOut=1")
  }

  if (session.status === "unavailable") {
    return (
      <PermissionProvider initialError={session.error}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <AppHeader />
            <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6 lg:p-8">
              <ApiUnavailablePanel error={session.error} />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </PermissionProvider>
    )
  }

  return (
    <PermissionProvider initialUser={session.user}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <AppHeader />
          <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6 lg:p-8">
            <RouteAccessGate>{children}</RouteAccessGate>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PermissionProvider>
  )
}
