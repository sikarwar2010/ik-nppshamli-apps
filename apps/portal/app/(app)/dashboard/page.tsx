"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Droplets,
  Home,
  IndianRupee,
  MapPin,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { buildSelectItems } from "@workspace/ui/lib/select-items"
import { cn } from "@workspace/ui/lib/utils"

import { useCan } from "@/hooks/use-permission"
import { api } from "@/lib/api"
import { ULB } from "@/lib/ulb-branding"
import { formatApiError } from "@/lib/format-api-error"

type WardCardStatus = "PENDING" | "COMPLETED"

type WardBreakdown = {
  wardId: string
  number: number
  code: string
  name: string
  surveyCount: number
  onlineCollection: number
  offlineCollection: number
  pendingCollection: number
  totalCollection: number
  propertyTaxDemand: number
  waterTaxDemand: number
  drainageTaxDemand: number
  totalTaxDemand: number
  propertyTaxPct: number
  waterTaxPct: number
  drainageTaxPct: number
  surveyedWithDemand?: number
  skippedSurveys?: number
  assessmentYearName: string | null
  status: WardCardStatus
}

type DashboardSummary = {
  totalProperties: number
  draftSurveys: number
  activeSurveys: number
  archivedSurveys: number
  completeQuality: number
  needsReviewQuality: number
  totalWards: number
  wardsWithSurveys: number
  wardsInProgress: number
  totalCollection: number
  onlineCollection: number
  offlineCollection: number
  pendingCollection: number
  pendingPayments: number
  successPayments: number
  failedPayments: number
  propertyTaxDemand: number
  waterTaxDemand: number
  drainageTaxDemand: number
  totalTaxDemand: number
  propertyTaxPct: number
  waterTaxPct: number
  drainageTaxPct: number
  wardBreakdown: WardBreakdown[]
}

type Ward = { id: string; number: number; name: string; code: string }

const WARD_ACCENTS = [
  "border-t-blue-500",
  "border-t-emerald-500",
  "border-t-violet-500",
  "border-t-amber-500",
  "border-t-rose-500",
  "border-t-cyan-500",
] as const

const taxChartConfig = {
  property: { label: "Property Tax", color: "var(--chart-2)" },
  drainage: { label: "Drainage Tax", color: "var(--chart-3)" },
  water: { label: "Water Tax", color: "var(--chart-4)" },
} satisfies ChartConfig

const wardCountChartConfig = {
  surveyCount: { label: "Properties", color: "var(--chart-1)" },
} satisfies ChartConfig

const wardTaxChartConfig = {
  propertyTaxDemand: { label: "Property Tax", color: "var(--chart-2)" },
  waterTaxDemand: { label: "Water Tax", color: "var(--chart-4)" },
  drainageTaxDemand: { label: "Drainage Tax", color: "var(--chart-3)" },
} satisfies ChartConfig

function formatInr(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

function formatRs(value: number): string {
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

function formatPct(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—"
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return `${rounded}%`
}

export default function DashboardPage() {
  const {
    allowed,
    isLoading: permLoading,
    isError: permError,
    error: permLoadError,
  } = useCan("dashboard:read")
  const [wardId, setWardId] = React.useState<string>("all")

  const wardsQuery = useQuery({
    queryKey: ["wards"],
    queryFn: async () => (await api.get<Ward[]>("/api/v1/wards")).data,
    enabled: allowed,
  })

  const wardSelectItems = React.useMemo(
    () => [
      { value: "all", label: "All Wards" },
      ...buildSelectItems(
        wardsQuery.data ?? [],
        (w) => w.id,
        (w) => `Ward ${w.number} — ${w.name}`
      ),
    ],
    [wardsQuery.data]
  )

  const summaryQuery = useQuery({
    queryKey: ["dashboard", wardId],
    queryFn: async () => {
      const qs = wardId !== "all" ? `?wardId=${wardId}` : ""
      return (await api.get<DashboardSummary>(`/api/v1/dashboard/summary${qs}`))
        .data
    },
    enabled: allowed,
  })

  if (permLoading) {
    return <DashboardSkeleton />
  }

  if (permError) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        {formatApiError(
          permLoadError,
          "Could not verify access. Confirm the API is running and try refreshing."
        )}
      </p>
    )
  }

  if (!allowed) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          You do not have access to the dashboard.
        </p>
        <p className="text-xs text-muted-foreground">
          Ask an administrator for{" "}
          <code className="text-foreground">dashboard:read</code>.
        </p>
      </div>
    )
  }

  const data = summaryQuery.data
  const loading = summaryQuery.isLoading

  const propertyTax = data?.propertyTaxDemand ?? 0
  const drainageTax = data?.drainageTaxDemand ?? 0
  const waterTax = data?.waterTaxDemand ?? 0
  const totalTax = data?.totalTaxDemand ?? propertyTax + drainageTax + waterTax

  const propertyPct = data?.propertyTaxPct ?? 0
  const waterPct = data?.waterTaxPct ?? 0
  const drainagePct = data?.drainageTaxPct ?? 0

  const taxMix = [
    {
      key: "property",
      name: "Property Tax",
      value: propertyTax,
      fill: "var(--color-property)",
    },
    {
      key: "drainage",
      name: "Drainage Tax",
      value: drainageTax,
      fill: "var(--color-drainage)",
    },
    {
      key: "water",
      name: "Water Tax",
      value: waterTax,
      fill: "var(--color-water)",
    },
  ]
  const taxMixTotal = taxMix.reduce((s, r) => s + r.value, 0)

  const wardBars = (data?.wardBreakdown ?? []).map((w) => ({
    ward: String(w.number),
    name: w.name,
    surveyCount: w.surveyCount,
    propertyTaxDemand: w.propertyTaxDemand,
    waterTaxDemand: w.waterTaxDemand,
    drainageTaxDemand: w.drainageTaxDemand,
    totalTaxDemand: w.totalTaxDemand,
  }))

  const hasWardTax = wardBars.some((w) => w.totalTaxDemand > 0)

  return (
    <div className="space-y-8 motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1">
            <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <li>Dashboard</li>
            </ol>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {ULB.nameEn}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ward-wise survey progress and assessed tax demand
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={wardId}
            items={wardSelectItems}
            onValueChange={(v) => setWardId(v ?? "all")}
          >
            <SelectTrigger
              className="h-11 w-64 cursor-pointer rounded-xl"
              aria-label="Filter by ward"
            >
              <SelectValue placeholder="All wards" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label="All Wards">
                All Wards
              </SelectItem>
              {(wardsQuery.data ?? []).map((w) => (
                <SelectItem
                  key={w.id}
                  value={w.id}
                  label={`Ward ${w.number} — ${w.name}`}
                >
                  Ward {w.number} — {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="h-11 cursor-pointer rounded-xl"
            render={<Link href="/surveys" />}
          >
            Open surveys
          </Button>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="ward-survey-stats">
        <SectionHeading
          id="ward-survey-stats"
          title="Ward Wise Survey Statistics"
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SolidStatCard
            title="Total Wards"
            value={data?.totalWards}
            loading={loading}
            icon={MapPin}
            tone="blue"
          />
          <SolidStatCard
            title="Survey Completed in Ward"
            value={data?.wardsWithSurveys}
            loading={loading}
            icon={ClipboardCheck}
            tone="green"
          />
          <SolidStatCard
            title="Survey in Progress"
            value={data?.wardsInProgress}
            loading={loading}
            icon={Clock3}
            tone="amber"
          />
          <SolidStatCard
            title="Survey Completed"
            value={data?.totalProperties}
            loading={loading}
            icon={CheckCircle2}
            tone="purple"
          />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="all-ward-tax">
        <SectionHeading id="all-ward-tax" title="All Ward Tax Collection" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TaxStatCard
            title={`Total Property Tax${propertyPct > 0 ? ` (${formatPct(propertyPct)})` : ""}`}
            value={data ? formatRs(propertyTax) : undefined}
            loading={loading}
            icon={Home}
            tone="green"
          />
          <TaxStatCard
            title={`Total Drainage Tax${drainagePct > 0 ? ` (${formatPct(drainagePct)})` : ""}`}
            value={data ? formatRs(drainageTax) : undefined}
            loading={loading}
            icon={Droplets}
            tone="amber"
          />
          <TaxStatCard
            title={`Total Water Tax${waterPct > 0 ? ` (${formatPct(waterPct)})` : ""}`}
            value={data ? formatRs(waterTax) : undefined}
            loading={loading}
            icon={Wallet}
            tone="purple"
          />
          <TaxStatCard
            title="Total Tax"
            value={data ? formatRs(totalTax) : undefined}
            loading={loading}
            icon={IndianRupee}
            tone="blue"
          />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="charts-analytics">
        <SectionHeading id="charts-analytics" title="Charts & Analytics" />
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="transition-shadow duration-200 hover:shadow-md xl:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tax Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="mx-auto size-48 rounded-full" />
              ) : taxMixTotal === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No assessed tax demand yet for this filter. Publish tax rates
                  and complete surveys to see totals.
                </p>
              ) : (
                <>
                  <ChartContainer
                    config={taxChartConfig}
                    className="mx-auto aspect-square max-h-56"
                  >
                    <PieChart>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            nameKey="key"
                            hideLabel
                            formatter={(value) => formatInr(Number(value ?? 0))}
                          />
                        }
                      />
                      <Pie
                        data={taxMix}
                        dataKey="value"
                        nameKey="key"
                        innerRadius={58}
                        outerRadius={84}
                        strokeWidth={2}
                      >
                        {taxMix.map((entry) => (
                          <Cell key={entry.key} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartLegend
                        content={<ChartLegendContent nameKey="key" />}
                      />
                    </PieChart>
                  </ChartContainer>
                  <table className="mt-2 w-full text-xs text-muted-foreground">
                    <caption className="sr-only">
                      Assessed tax demand by category
                    </caption>
                    <tbody>
                      {taxMix.map((row) => (
                        <tr key={row.key} className="border-t">
                          <td className="py-1.5 text-foreground/80">
                            {row.name}
                          </td>
                          <td className="py-1.5 text-right font-medium text-foreground tabular-nums">
                            {formatInr(row.value)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t font-semibold">
                        <td className="py-1.5 text-foreground">Total Tax</td>
                        <td className="py-1.5 text-right text-foreground tabular-nums">
                          {formatInr(totalTax)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="transition-shadow duration-200 hover:shadow-md xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ward Property Count</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : wardBars.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No wards mapped yet.
                </p>
              ) : (
                <ChartContainer
                  config={wardCountChartConfig}
                  className="aspect-auto h-64 w-full"
                >
                  <BarChart
                    accessibilityLayer
                    data={wardBars}
                    margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="ward"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) => {
                            const row = payload?.[0]?.payload as
                              { ward?: string; name?: string } | undefined
                            return row?.name
                              ? `Ward ${row.ward} — ${row.name}`
                              : `Ward ${row?.ward ?? ""}`
                          }}
                        />
                      }
                    />
                    <Bar
                      dataKey="surveyCount"
                      fill="var(--color-surveyCount)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="transition-shadow duration-200 hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ward Tax Collection</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full" />
            ) : !hasWardTax ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No ward tax demand to chart yet.
              </p>
            ) : (
              <ChartContainer
                config={wardTaxChartConfig}
                className="aspect-auto h-72 w-full"
              >
                <BarChart
                  accessibilityLayer
                  data={wardBars}
                  margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="ward"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v) =>
                      Number(v).toLocaleString("en-IN", {
                        notation: "compact",
                        maximumFractionDigits: 1,
                      })
                    }
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatInr(Number(value ?? 0))}
                        labelFormatter={(_, payload) => {
                          const row = payload?.[0]?.payload as
                            { ward?: string; name?: string } | undefined
                          return row?.name
                            ? `Ward ${row.ward} — ${row.name}`
                            : `Ward ${row?.ward ?? ""}`
                        }}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="propertyTaxDemand"
                    stackId="tax"
                    fill="var(--color-propertyTaxDemand)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="waterTaxDemand"
                    stackId="tax"
                    fill="var(--color-waterTaxDemand)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="drainageTaxDemand"
                    stackId="tax"
                    fill="var(--color-drainageTaxDemand)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="ward-tax-cards">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <SectionHeading
            id="ward-tax-cards"
            title="Ward Wise Tax Collection"
          />
          <p className="text-sm text-muted-foreground">
            {data?.totalWards ?? "—"} wards mapped
          </p>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : (data?.wardBreakdown ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            No wards available for tax collection display.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {(data?.wardBreakdown ?? []).map((ward, index) => (
              <WardCollectionCard
                key={ward.wardId}
                ward={ward}
                accent={WARD_ACCENTS[index % WARD_ACCENTS.length]!}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SectionHeading({ id, title }: { id?: string; title: string }) {
  return (
    <h2
      id={id}
      className="text-base font-semibold tracking-tight text-slate-800 dark:text-slate-100"
    >
      <span className="border-b-2 border-sky-600 pb-0.5 dark:border-sky-400">
        {title}
      </span>
    </h2>
  )
}

const solidTones = {
  blue: "from-blue-600 to-blue-700",
  green: "from-emerald-600 to-emerald-700",
  amber: "from-amber-500 to-orange-600",
  purple: "from-violet-600 to-violet-700",
} as const

function SolidStatCard({
  title,
  value,
  loading,
  icon: Icon,
  tone,
}: {
  title: string
  value?: number
  loading?: boolean
  icon: React.ComponentType<{ className?: string }>
  tone: keyof typeof solidTones
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-linear-to-br p-5 text-white shadow-md transition-shadow duration-200 hover:shadow-lg",
        solidTones[tone]
      )}
    >
      <div className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full bg-white/20">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="pr-12 text-sm font-medium text-white/90">{title}</p>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-20 bg-white/30" />
      ) : (
        <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
          {value?.toLocaleString("en-IN") ?? "—"}
        </p>
      )}
    </div>
  )
}

const taxCardTones = {
  green: {
    icon: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-900/40",
  },
  amber: {
    icon: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-900/40",
  },
  purple: {
    icon: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    border: "border-violet-200 dark:border-violet-900/40",
  },
  blue: {
    icon: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    border: "border-sky-200 dark:border-sky-900/40",
  },
} as const

function TaxStatCard({
  title,
  value,
  loading,
  icon: Icon,
  tone,
}: {
  title: string
  value?: string
  loading?: boolean
  icon: React.ComponentType<{ className?: string }>
  tone: keyof typeof taxCardTones
}) {
  const styles = taxCardTones[tone]
  return (
    <Card
      className={cn(
        "transition-shadow duration-200 hover:shadow-md",
        styles.border
      )}
    >
      <CardContent className="relative pt-5 pb-5">
        <div
          className={cn(
            "absolute top-4 right-4 flex size-11 items-center justify-center rounded-full",
            styles.icon
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
        <p className="pr-14 text-sm font-medium text-slate-600 dark:text-slate-300">
          {title}
        </p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-32" />
        ) : (
          <p className="mt-1 truncate text-xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
            {value ?? "—"}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function WardCollectionCard({
  ward,
  accent,
}: {
  ward: WardBreakdown
  accent: string
}) {
  const propertyAmount = ward.propertyTaxDemand
  const waterAmount = ward.waterTaxDemand
  const drainageAmount = ward.drainageTaxDemand
  const total = ward.totalTaxDemand

  const propertyShare =
    total > 0 ? Math.round((propertyAmount / total) * 100) : 0
  const waterShare = total > 0 ? Math.round((waterAmount / total) * 100) : 0
  const drainageShare =
    total > 0 ? Math.round((drainageAmount / total) * 100) : 0

  return (
    <Card
      className={cn(
        "border-t-4 transition-shadow duration-200 hover:shadow-md",
        accent
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Ward {String(ward.number).padStart(2, "0")}
          </p>
          <p className="truncate font-(family-name:--font-deva) text-sm font-semibold text-foreground">
            {ward.name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
          <Building2 className="size-3.5" aria-hidden />
          <span className="tabular-nums">{ward.surveyCount}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricRow
          label={
            ward.propertyTaxPct > 0
              ? `Property Tax Rate ${formatPct(ward.propertyTaxPct)}`
              : "Property Tax"
          }
          value={formatRs(propertyAmount)}
          pct={propertyShare}
          barClass="bg-blue-600"
        />
        <MetricRow
          label={
            ward.waterTaxPct > 0
              ? `Water Tax Rate ${formatPct(ward.waterTaxPct)}`
              : "Water Tax"
          }
          value={formatRs(waterAmount)}
          pct={waterShare}
          barClass="bg-cyan-600"
        />
        <MetricRow
          label={
            ward.drainageTaxPct > 0
              ? `Drainage Tax Rate ${formatPct(ward.drainageTaxPct)}`
              : "Drainage Tax"
          }
          value={formatRs(drainageAmount)}
          pct={drainageShare}
          barClass="bg-amber-500"
        />
        <div className="flex items-center justify-between border-t pt-3">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Total Tax
            </p>
            <p className="text-sm font-bold tabular-nums">{formatRs(total)}</p>
          </div>
          <StatusBadge status={ward.status} />
        </div>
      </CardContent>
    </Card>
  )
}

function MetricRow({
  label,
  value,
  pct,
  barClass,
}: {
  label: string
  value: string
  pct: number
  barClass: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-600 dark:text-slate-300">{label}</span>
        <span className="font-semibold text-foreground tabular-nums">
          {value}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="presentation"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 motion-reduce:transition-none",
            barClass
          )}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: WardCardStatus }) {
  if (status === "COMPLETED") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300">
        Completed
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      Pending
    </Badge>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    </div>
  )
}
