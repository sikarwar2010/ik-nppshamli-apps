"use client"

import { ChevronDown } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

import {
  NAV_ITEMS,
  isNavHrefActive,
  isSurveyNavActive,
  type NavItem,
} from "@/components/app-nav"
import { usePermission } from "@/hooks/use-permission"
import { formatApiError } from "@/lib/format-api-error"
import { ULB, ULB_LOCATION_LABEL } from "@/lib/ulb-branding"

function canSee(
  item: NavItem,
  hasPermission: (c: string | string[]) => boolean
) {
  if (!item.permission) return true
  if (Array.isArray(item.permission)) {
    return item.permission.some((p) => hasPermission(p))
  }
  return hasPermission(item.permission)
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/surveys") {
    return isSurveyNavActive(pathname)
  }
  if (item.href) {
    return isNavHrefActive(item.href, pathname, item.exact)
  }
  return (
    item.children?.some(
      (c) => c.href && isNavHrefActive(c.href, pathname, c.exact)
    ) ?? false
  )
}

function NavCollapsibleGroup({
  item,
  pathname,
}: {
  item: NavItem
  pathname: string
}) {
  const isActive = isItemActive(item, pathname)
  const [open, setOpen] = useState(isActive)

  useEffect(() => {
    if (isActive) {
      setOpen(true)
    }
  }, [isActive])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <SidebarMenuButton
          render={<CollapsibleTrigger />}
          tooltip={item.title}
          className="cursor-pointer text-sidebar-foreground"
        >
          {item.icon ? <item.icon /> : null}
          <span>{item.title}</span>
          <ChevronDown className="ml-auto size-4 opacity-60 transition-transform duration-200 group-data-open/collapsible:rotate-180" />
        </SidebarMenuButton>
        <CollapsibleContent>
          <SidebarMenuSub className="mt-1 ml-3.5 border-l border-sidebar-border pl-2">
            {item.children?.map((child) => (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton
                  render={<Link href={child.href!} />}
                  isActive={
                    child.href
                      ? isNavHrefActive(child.href, pathname, child.exact)
                      : false
                  }
                  className="cursor-pointer rounded-lg transition-colors duration-200"
                >
                  <span>{child.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { hasPermission, isLoading, isError, error, refetch } = usePermission()

  const visible = NAV_ITEMS.filter((item) => canSee(item, hasPermission)).map(
    (item) => ({
      ...item,
      children: item.children?.filter((c) => canSee(c, hasPermission)),
    })
  )

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="gap-0 px-3 pt-4 pb-2">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border border-sidebar-border bg-card px-3 py-2.5 shadow-sm",
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none"
          )}
        >
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/10 group-data-[collapsible=icon]:size-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- official seal from /public */}
            <img
              src="/branding/up-government-logo.png"
              alt="Uttar Pradesh Government"
              width={40}
              height={40}
              className="size-full object-contain p-0.5"
            />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p
              className="truncate text-sm font-semibold tracking-tight text-foreground"
              title={ULB.nameEn}
            >
              {ULB.nameEn}
            </p>
            <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {ULB_LOCATION_LABEL}
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 pt-3">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {isLoading ? (
                <div className="space-y-2 px-1 py-1">
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              ) : isError ? (
                <div className="space-y-2 px-2 text-xs text-muted-foreground">
                  <p role="alert">
                    {formatApiError(
                      error,
                      "Could not load permissions."
                    )}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => refetch()}
                  >
                    Retry
                  </Button>
                </div>
              ) : visible.length === 0 ? (
                <p className="px-2 text-xs text-muted-foreground">
                  No menu access for this account. Ask an admin to assign a
                  role.
                </p>
              ) : (
                visible.map((item) => {
                  if (item.children?.length) {
                    return (
                      <NavCollapsibleGroup
                        key={item.title}
                        item={item}
                        pathname={pathname}
                      />
                    )
                  }

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        render={<Link href={item.href!} />}
                        isActive={isItemActive(item, pathname)}
                        tooltip={item.title}
                        className="cursor-pointer text-sidebar-foreground"
                      >
                        {item.icon ? <item.icon /> : null}
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
