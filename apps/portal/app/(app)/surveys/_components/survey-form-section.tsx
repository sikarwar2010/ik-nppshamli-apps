"use client"

import { ChevronDown, TriangleAlert } from "lucide-react"
import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

type SurveyFormSectionProps = {
  id: string
  title: string
  description?: string
  children: React.ReactNode
  /** When true, section header shows an error indicator and stays open. */
  hasError?: boolean
  defaultOpen?: boolean
  storageKey?: string
  className?: string
  contentClassName?: string
}

export function SurveyFormSection({
  id,
  title,
  description,
  children,
  hasError = false,
  defaultOpen = true,
  storageKey,
  className,
  contentClassName,
}: SurveyFormSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") return
    try {
      const stored = sessionStorage.getItem(storageKey)
      if (stored === "0") setOpen(false)
      if (stored === "1") setOpen(true)
    } catch {
      /* ignore storage errors */
    }
  }, [storageKey])

  React.useEffect(() => {
    if (hasError) setOpen(true)
  }, [hasError])

  function handleOpenChange(next: boolean) {
    if (hasError && !next) return
    setOpen(next)
    if (!storageKey || typeof window === "undefined") return
    try {
      sessionStorage.setItem(storageKey, next ? "1" : "0")
    } catch {
      /* ignore */
    }
  }

  return (
    <Card id={id} className={cn("scroll-mt-24 overflow-visible", className)}>
      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <CardHeader className="gap-1 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                {title}
                {hasError ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                    <TriangleAlert className="size-3.5" aria-hidden />
                    Needs attention
                  </span>
                ) : null}
              </CardTitle>
              {description ? (
                <CardDescription className="text-sm text-muted-foreground">
                  {description}
                </CardDescription>
              ) : null}
            </div>
            <CollapsibleTrigger
              type="button"
              className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform duration-200",
                  open ? "rotate-0" : "-rotate-90"
                )}
              />
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent
            className={cn(
              "grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3",
              contentClassName
            )}
          >
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
