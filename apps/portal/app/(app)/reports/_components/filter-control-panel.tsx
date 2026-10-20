"use client"

import { Filter, RotateCcw } from "lucide-react"
import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { buildSelectItems } from "@workspace/ui/lib/select-items"
import { ULB } from "@/lib/ulb-branding"

type Ward = { id: string; name: string; number: number }

export type ReportFilters = {
  wardId: string
  propertyUse: string
  from: string
  to: string
  autoFilter: boolean
}

const MONTH_CHIPS = [
  { label: "This month", months: 0 },
  { label: "Last month", months: 1 },
  { label: "2 months back", months: 2 },
] as const

function monthRange(monthsBack: number) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
  const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0)
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  }
}

export function FilterControlPanel({
  filters,
  onChange,
  wards,
}: {
  filters: ReportFilters
  onChange: (f: ReportFilters) => void
  wards: Ward[]
}) {
  const activeCount = [
    filters.wardId,
    filters.propertyUse,
    filters.from,
    filters.to,
  ].filter(Boolean).length

  const wardSelectItems = React.useMemo(
    () => [
      { value: "__all__", label: "All wards" },
      ...buildSelectItems(
        wards,
        (w) => w.id,
        (w) => w.name
      ),
    ],
    [wards]
  )

  const reset = () =>
    onChange({ wardId: "", propertyUse: "", from: "", to: "", autoFilter: false })

  return (
    <Card className="rounded-xl border shadow-sm">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4" aria-hidden />
            Filter Control Panel
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {activeCount} active
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {MONTH_CHIPS.map((chip) => (
            <Button
              key={chip.label}
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer text-xs"
              onClick={() => {
                const { from, to } = monthRange(chip.months)
                onChange({ ...filters, from, to })
              }}
            >
              {chip.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-pointer text-xs"
            onClick={reset}
          >
            <RotateCcw className="mr-1 size-3" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">ULB</Label>
          <Input value={ULB.nameEn} readOnly className="bg-muted" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rpt-ward" className="text-xs text-muted-foreground">
            Ward
          </Label>
          <Select
            value={filters.wardId || "__all__"}
            items={wardSelectItems}
            onValueChange={(v) =>
              onChange({ ...filters, wardId: v === "__all__" || !v ? "" : v })
            }
          >
            <SelectTrigger id="rpt-ward" className="w-full cursor-pointer">
              <SelectValue placeholder="All wards" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" label="All wards" className="cursor-pointer">
                All wards
              </SelectItem>
              {wards.map((w) => (
                <SelectItem key={w.id} value={w.id} label={w.name} className="cursor-pointer">
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rpt-from" className="text-xs text-muted-foreground">
            From date
          </Label>
          <Input
            id="rpt-from"
            type="date"
            value={filters.from}
            onChange={(e) => onChange({ ...filters, from: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rpt-to" className="text-xs text-muted-foreground">
            To date
          </Label>
          <Input
            id="rpt-to"
            type="date"
            value={filters.to}
            onChange={(e) => onChange({ ...filters, to: e.target.value })}
          />
        </div>
      </CardContent>
      <CardContent className="border-t pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={filters.autoFilter}
            onCheckedChange={(v) =>
              onChange({ ...filters, autoFilter: v === true })
            }
          />
          <span className="font-medium">Enable Excel Filter</span>
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Adds AutoFilter to Survey Data and QC Final Excel header rows (off by
          default).
        </p>
      </CardContent>
    </Card>
  )
}
