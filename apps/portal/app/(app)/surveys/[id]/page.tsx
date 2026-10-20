"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import { useCan } from "@/hooks/use-permission"
import { api } from "@/lib/api"
import {
  formatCatalogDisplay,
  formatCatalogLabel,
} from "@/lib/catalog-labels"
import {
  ULB_NAME,
  floorUsageChecks,
  formatArea,
  formatParcelNo,
  formatPropertyNo,
  parseGisSurveyId,
  pickBestSurveySearchMatch,
  qualityLabel,
  toNumber,
} from "@/lib/survey-format"

import { SurveyImages, type SurveyImage } from "../_components/survey-images"

type Neighbor = { id: string; surveyId: string }

type FloorRow = {
  id: string
  floorLabel: string
  areaSqFt: string | null
  areaSqMeter: string | null
  usageType: string | null
  usageFactor: string | null
  buildingType: string | null
}

type SurveyDetail = {
  id: string
  wardId: string
  surveyId: string
  surveyedAt: string | null
  status: string
  dataQualityStatus: string
  ownerName: string | null
  ownerFatherName: string | null
  mobile: string | null
  ownerAadhaar: string | null
  propertyOwnership: string | null
  respondentName: string | null
  respondentRelationship: string | null
  parcelNo: string | null
  propertyNo: string | null
  electricityId: string | null
  khasraNo: string | null
  registryNo: string | null
  constructedDate: string | null
  remark: string | null
  city: string | null
  presentHouseNo: string | null
  presentStreetName: string | null
  presentLocality: string | null
  presentColony: string | null
  presentCity: string | null
  presentPincode: string | null
  isSameAsProperty: boolean | null
  exemptionType: string | null
  exemptionApplicable: boolean | null
  plotAreaSqMeter: string | null
  plinthAreaSqMeter: string | null
  totalBuiltUpAreaSqMeter: string | null
  houseNo: string | null
  streetName: string | null
  locality: string | null
  colony: string | null
  pincode: string | null
  propertyUse: string | null
  commercial: string | null
  taxRateZone: string | null
  yearOfConstruction: string | null
  situation: string | null
  roadType: string | null
  isSlum: boolean
  plotAreaSqFt: string | null
  plinthAreaSqFt: string | null
  totalBuiltUpAreaSqFt: string | null
  floorsRaw: string | null
  hasMunicipalWaterSupply: boolean | null
  hasAlternateWater: boolean | null
  waterSourceType: string | null
  totalWaterConnections: number | null
  waterConnectionIdType: string | null
  toiletType: string | null
  hasMunicipalWasteService: boolean | null
  sourceStatus: string | null
  surveyorName: string | null
  assessmentYear: string | null
  oldPropertyNo: string | null
  propertyType: string | null
  latitude: string | null
  longitude: string | null
  sourceRowNumber: number | null
  ward: { number: number; name: string }
  floors: FloorRow[]
  attachments?: SurveyImage[]
  createdBy?: { name: string } | null
  updatedBy?: { name: string } | null
  createdAt?: string
  updatedAt?: string
  neighbors?: { previous: Neighbor | null; next: Neighbor | null }
}

type AuditLog = {
  id: string
  action: string
  entity: string
  entityId: string | null
  createdAt: string
  actor?: { name: string; email: string } | null
  oldValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
}

type SurveySearchRow = {
  id: string
  surveyId: string
  parcelNo: string | null
}

export default function SurveyDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { allowed: canEdit } = useCan("survey:update")
  const { allowed: canDelete } = useCan("survey:delete")
  const { allowed: canAudit } = useCan("audit:read")
  const [parcelQuery, setParcelQuery] = React.useState("")
  const [goPending, setGoPending] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const query = useQuery({
    queryKey: ["survey", params.id],
    queryFn: async () =>
      (await api.get<SurveyDetail>(`/api/v1/surveys/${params.id}`)).data,
  })

  const auditQuery = useQuery({
    queryKey: ["audit-logs", "Survey", query.data?.id],
    enabled: canAudit && Boolean(query.data?.id),
    queryFn: async () => {
      const qs = new URLSearchParams({
        entity: "Survey",
        entityId: query.data!.id,
        pageSize: "50",
      })
      return (await api.get<AuditLog[]>(`/api/v1/audit-logs?${qs}`)).data
    },
  })

  const statusMutation = useMutation({
    mutationFn: async (status: "ACTIVE" | "ARCHIVED") =>
      api.patch(`/api/v1/surveys/${params.id}`, { status }),
    onSuccess: async (_res, status) => {
      toast.success(
        status === "ARCHIVED" ? "Survey archived" : "Survey restored"
      )
      await queryClient.invalidateQueries({ queryKey: ["survey", params.id] })
      await queryClient.invalidateQueries({ queryKey: ["surveys"] })
    },
    onError: (err: Error) => toast.error(err.message || "Update failed"),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/api/v1/surveys/${params.id}`),
    onSuccess: async () => {
      toast.success("Survey deleted")
      await queryClient.invalidateQueries({ queryKey: ["surveys"] })
      router.push("/surveys")
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  })

  const goToParcel = React.useCallback(async () => {
    const q = parcelQuery.trim()
    if (!q) {
      toast.error("Enter a parcel number or survey ID")
      return
    }
    const paramsQs = new URLSearchParams({
      search: q,
      pageSize: "20",
      sortBy: "parcelNo",
      sortOrder: "asc",
    })
    if (query.data?.wardId) paramsQs.set("wardId", query.data.wardId)
    setGoPending(true)
    try {
      const res = await api.get<SurveySearchRow[]>(
        `/api/v1/surveys?${paramsQs}`
      )
      const match = pickBestSurveySearchMatch(res.data ?? [], q)
      if (!match) {
        toast.error("No parcel found in this ward")
        return
      }
      if (match.id === query.data?.id) {
        toast.message("Already viewing this parcel")
        return
      }
      router.push(`/surveys/${match.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed")
    } finally {
      setGoPending(false)
    }
  }, [parcelQuery, query.data, router])

  if (query.isLoading) return <DetailSkeleton />
  if (query.isError || !query.data) {
    return (
      <div className="space-y-3">
        <Button
          variant="outline"
          className="cursor-pointer"
          render={<Link href="/surveys" />}
        >
          <ChevronLeft />
          Back to registry
        </Button>
        <p className="text-muted-foreground">Survey not found.</p>
      </div>
    )
  }

  const s = query.data
  const gis = parseGisSurveyId(s.surveyId)
  const parcel = formatParcelNo(s.parcelNo, s.surveyId)
  const unit = formatPropertyNo(s.propertyNo, s.surveyId)
  const checks = floorUsageChecks({
    plotAreaSqFt: s.plotAreaSqFt,
    plinthAreaSqFt: s.plinthAreaSqFt,
    totalBuiltUpAreaSqFt: s.totalBuiltUpAreaSqFt,
    floors: s.floors,
  })
  const floorTotals = derivedFloorTotals(s.floors)
  const previous = s.neighbors?.previous
  const next = s.neighbors?.next

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            render={<Link href="/surveys" />}
          >
            <ChevronLeft />
            Back to registry
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            disabled={!previous}
            onClick={() => previous && router.push(`/surveys/${previous.id}`)}
          >
            <ChevronLeft />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            disabled={!next}
            onClick={() => next && router.push(`/surveys/${next.id}`)}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              render={<Link href={`/surveys/${s.id}/edit`} />}
            >
              <Pencil />
              Edit
            </Button>
          ) : null}
          {canEdit && s.status !== "ARCHIVED" ? (
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("ARCHIVED")}
            >
              <Archive />
              Archive
            </Button>
          ) : null}
          {canEdit && s.status === "ARCHIVED" ? (
            <Button
              size="sm"
              className="cursor-pointer"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("ACTIVE")}
            >
              <RotateCcw />
              Restore
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="destructive"
              size="sm"
              className="cursor-pointer"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            Active ward
          </p>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">
            {ULB_NAME} — Ward {s.ward.number}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {s.ward.name}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={qualityBadgeClass(s.dataQualityStatus)}>
            {qualityLabel(s.dataQualityStatus)}
          </Badge>
          <Badge className={statusBadgeClass(s.status)}>{s.status}</Badge>
        </div>
      </div>

      <form
        className="flex w-full max-w-md items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void goToParcel()
        }}
      >
        <label htmlFor="go-parcel" className="sr-only">
          Go to parcel
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="go-parcel"
            value={parcelQuery}
            onChange={(e) => setParcelQuery(e.target.value)}
            placeholder="Go to parcel or survey ID"
            className="pl-8"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="cursor-pointer"
          disabled={goPending}
        >
          {goPending ? "…" : "Go"}
        </Button>
      </form>

      <Card className="shadow-sm">
        <CardContent className="grid gap-4 pt-1 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCell label="Property ID" value={s.surveyId} mono />
          <SummaryCell label="ULB Name" value={ULB_NAME} />
          <SummaryCell label="Ward No" value={String(s.ward.number)} />
          <SummaryCell label="Parcel No" value={parcel} />
          <SummaryCell label="Owner Name" value={s.ownerName} />
        </CardContent>
      </Card>

      <SectionCard title="Survey & Owner">
        <FieldGrid>
          <Field label="Property Id" value={s.surveyId} />
          <Field label="Survey Status (source)" value={s.sourceStatus} />
          <Field label="Surveyor Name" value={s.surveyorName} />
          <Field label="Assessment Year" value={s.assessmentYear} />
          <Field
            label="Date of Survey"
            value={
              s.surveyedAt
                ? new Date(s.surveyedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—"
            }
          />
          <Field
            label="Owner Name"
            value={displayWithFallback(s.ownerName, "N/A")}
          />
          <Field
            label="Owner Father Name"
            value={displayWithFallback(s.ownerFatherName, "N/A")}
          />
          <Field
            label="Mobile No"
            value={displayWithFallback(s.mobile, "—")}
          />
          <Field
            label="Ward Name"
            value={`Ward ${s.ward.number} — ${s.ward.name}`}
          />
          <Field label="Is Slum" value={yn(s.isSlum)} />
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Parcel">
        <FieldGrid>
          <Field label="Parcel No" value={parcel} />
          <Field label="Unit / Property No" value={unit} />
          <Field label="Old Property Number" value={s.oldPropertyNo} />
          <Field label="GIS Use Code" value={gis?.useLetter ?? "—"} />
          <Field label="Constructed Date" value={s.constructedDate} />
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Respondent">
        <FieldGrid>
          <Field label="Respondent Name" value={s.respondentName} />
          <Field
            label="Respondent Relationship"
            value={s.respondentRelationship}
          />
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Address">
        <FieldGrid cols="2">
          <Field label="City" value={s.city} />
          <Field label="Pincode" value={s.pincode} />
          <Field label="House No" value={s.houseNo} />
          <Field label="Street Name" value={s.streetName} />
          <Field label="Locality" value={s.locality} />
          <Field label="Colony" value={s.colony} />
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Classification">
        <FieldGrid>
          <Field
            label="Tax Rate Zone"
            value={formatCatalogDisplay(s.taxRateZone)}
          />
          <Field
            label="Property Ownership"
            value={formatCatalogDisplay(s.propertyOwnership)}
          />
          <Field label="Property Type" value={s.propertyType} />
          <Field
            label="Property Use"
            value={formatCatalogDisplay(s.propertyUse)}
          />
          <Field
            label="Commercial subtype"
            value={formatCatalogDisplay(s.commercial)}
          />
          <Field
            label="Year of Construction"
            value={formatCatalogDisplay(s.yearOfConstruction)}
          />
          <Field
            label="Situation"
            value={formatCatalogDisplay(s.situation)}
          />
          <Field
            label="Road Type"
            value={formatCatalogDisplay(s.roadType)}
          />
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Floors & Area">
        {checks.length ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              <TriangleAlert className="size-4" />
              Floor usage checks ({checks.length})
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200/90">
              {checks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <FieldGrid>
          <Field
            label="Plot Area SqFt"
            value={formatArea(s.plotAreaSqFt, s.plotAreaSqMeter)}
          />
          <Field
            label="Plinth Area SqFt"
            value={formatArea(s.plinthAreaSqFt, s.plinthAreaSqMeter)}
          />
          <Field
            label="Total Built Up Area SqFt"
            value={formatArea(
              s.totalBuiltUpAreaSqFt,
              s.totalBuiltUpAreaSqMeter
            )}
          />
        </FieldGrid>

        <p className="mt-4 mb-2 text-sm text-muted-foreground">
          Derived floor totals:{" "}
          {floorTotals.length
            ? floorTotals
              .map((row) => `${row.label.toUpperCase()} ${row.area} sq ft`)
              .join(" — ")
            : "—"}
        </p>

        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[40rem]">
            <TableHeader>
              <TableRow>
                <TableHead>S. No.</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead>Usage Type</TableHead>
                <TableHead>Usage Factor</TableHead>
                <TableHead>Construction</TableHead>
                <TableHead className="text-right">Area (Sq Ft)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.floors.length ? (
                s.floors.map((floor, index) => (
                  <TableRow key={floor.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      {formatCatalogLabel(floor.floorLabel) || floor.floorLabel}
                    </TableCell>
                    <TableCell>
                      {floor.usageType
                        ? formatCatalogLabel(floor.usageType)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {floor.usageFactor
                        ? formatCatalogLabel(floor.usageFactor)
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-[16rem] whitespace-normal break-words">
                      {floor.buildingType
                        ? formatCatalogLabel(floor.buildingType)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {dash(floor.areaSqFt)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No floor breakdown parsed from Excel.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="font-semibold">
                  Total built-up area
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatArea(
                    s.totalBuiltUpAreaSqFt,
                    s.totalBuiltUpAreaSqMeter
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Location">
        <FieldGrid>
          <Field label="Latitude" value={s.latitude} />
          <Field label="Longitude" value={s.longitude} />
          {s.latitude && s.longitude ? (
            <div className="flex items-center sm:col-span-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-10 cursor-pointer"
                render={
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=19/${s.latitude}/${s.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                Open location on map
              </Button>
            </div>
          ) : null}
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Property Images" id="images">
        <SurveyImages
          surveyId={s.id}
          images={s.attachments ?? []}
          canEdit={canEdit}
        />
      </SectionCard>

      <SectionCard title="Municipal Services">
        <FieldGrid>
          <Field
            label="Is Municipal Water Supply"
            value={yn(s.hasMunicipalWaterSupply)}
          />
          <Field
            label="Total Water Connection"
            value={s.totalWaterConnections}
          />
          <Field
            label="Water Connection Id/Type"
            value={s.waterConnectionIdType}
          />
          <Field label="Toilet Type" value={s.toiletType} />
          <Field
            label="Is Municipal Waste Service"
            value={yn(s.hasMunicipalWasteService)}
          />
          <Field label="Alternate Water" value={yn(s.hasAlternateWater)} />
          <Field label="Water Source" value={s.waterSourceType} />
        </FieldGrid>
      </SectionCard>

      {canAudit ? (
        <SectionCard title="Audit History" id="audit-history">
          <div className="overflow-x-auto rounded-xl border">
            <Table className="min-w-[36rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ) : (auditQuery.data ?? []).length ? (
                  (auditQuery.data ?? []).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.action}
                      </TableCell>
                      <TableCell>{log.actor?.name ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs">
                        {auditDetails(log)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No audit entries for this survey yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this survey?</DialogTitle>
            <DialogDescription>
              {s.surveyId} will be marked deleted and removed from the registry.
              This cannot be undone from the portal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete survey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SectionCard({
  title,
  children,
  id,
}: {
  title: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <Card
      id={id}
      className="scroll-mt-24 overflow-hidden shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <CardHeader className="border-b bg-muted/30 pb-3">
        <CardTitle className="text-base font-semibold tracking-tight text-primary">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  )
}

function FieldGrid({
  children,
  cols = "4",
}: {
  children: React.ReactNode
  cols?: "2" | "4"
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        cols === "2" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"
      )}
    >
      {children}
    </div>
  )
}

function Field({
  label,
  value,
}: {
  label: string
  value?: string | number | null
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/30 px-3 py-2.5 transition-colors duration-200">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold wrap-break-word text-foreground">
        {dash(value)}
      </p>
    </div>
  )
}

function SummaryCell({
  label,
  value,
  mono,
}: {
  label: string
  value?: string | null
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          mono && "font-mono text-xs break-all sm:text-sm"
        )}
      >
        {dash(value)}
      </p>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}

function dash(value?: string | number | null) {
  if (value == null || value === "") return "—"
  return String(value)
}

/** Display-only fallback for Survey & Owner; never mutates API/form data. */
function displayWithFallback(
  value: string | null | undefined,
  emptyFallback: string
): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : emptyFallback
}

function yn(value?: boolean | null) {
  if (value == null) return "—"
  return value ? "Yes" : "No"
}

function statusBadgeClass(status: string) {
  if (status === "ACTIVE") {
    return "bg-violet-600/15 text-violet-800 hover:bg-violet-600/15 dark:text-violet-300"
  }
  if (status === "DRAFT") {
    return "bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300"
  }
  if (status === "ARCHIVED") {
    return "bg-muted text-muted-foreground hover:bg-muted"
  }
  return ""
}

function qualityBadgeClass(status: string) {
  if (status === "COMPLETE") {
    return "bg-teal-600/15 text-teal-800 hover:bg-teal-600/15 dark:text-teal-300"
  }
  if (status === "NEEDS_REVIEW") {
    return "bg-sky-600/15 text-sky-800 hover:bg-sky-600/15 dark:text-sky-300"
  }
  return "bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300"
}

function derivedFloorTotals(floors: FloorRow[]) {
  const map = new Map<string, number>()
  for (const floor of floors) {
    const area = toNumber(floor.areaSqFt) ?? 0
    map.set(floor.floorLabel, (map.get(floor.floorLabel) ?? 0) + area)
  }
  return [...map.entries()].map(([label, area]) => ({ label, area }))
}

function auditDetails(log: AuditLog) {
  const payload = log.newValue ?? log.oldValue
  if (!payload || typeof payload !== "object") return "—"

  const changes = (
    payload as {
      changes?: Array<{
        field: string
        old?: unknown
        new?: unknown
        value?: unknown
      }>
    }
  ).changes
  if (Array.isArray(changes) && changes.length > 0) {
    return changes
      .map((change) => {
        const label = auditFieldLabel(change.field)
        if ("new" in change && change.new !== undefined) {
          const oldStr =
            change.old == null || change.old === "" ? "—" : String(change.old)
          const newStr =
            change.new == null || change.new === "" ? "—" : String(change.new)
          return `${label}: ${oldStr} → ${newStr}`
        }
        return `${label}: ${String(change.value ?? "—")}`
      })
      .join("; ")
  }

  return Object.entries(payload as Record<string, unknown>)
    .filter(([key]) => key !== "source")
    .map(([key, value]) => `${auditFieldLabel(key)}: ${String(value)}`)
    .join(", ")
}

const AUDIT_FIELD_LABELS: Record<string, string> = {
  surveyId: "Survey ID",
  parcelNo: "Parcel No",
  propertyNo: "Property No",
  gisUseCode: "GIS Use Code",
  ownerName: "Owner Name",
  ownerFatherName: "Owner Father Name",
}

function auditFieldLabel(field: string): string {
  return (
    AUDIT_FIELD_LABELS[field] ??
    field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())
  )
}
