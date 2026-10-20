"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import type { StaffPaymentReceipt } from "@workspace/types"
import { Loader2, Printer, Search } from "lucide-react"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  buildSelectItems,
  buildStringSelectItems,
} from "@workspace/ui/lib/select-items"

import { api } from "@/lib/api"

import { printOfflinePaymentReceipt } from "./_lib/receipt-template"
import { ULB } from "@/lib/ulb-branding"

const PAYMENT_MODES = ["CASH", "CHEQUE", "DD", "UPI_MANUAL", "OTHER"] as const
const MODES_NEEDING_REF = new Set(["CHEQUE", "DD", "UPI_MANUAL"])

const paymentModeItems = buildStringSelectItems(PAYMENT_MODES)

type Ward = { id: string; name: string; number: number }

type SurveyRow = {
  id: string
  surveyId: string
  ownerName: string | null
  mobile?: string | null
  ward: { id?: string; name: string; number: number } | null
  propertyNo: string | null
  parcelNo?: string | null
  houseNo?: string | null
  propertyUse: string | null
}

type SurveyDetail = SurveyRow & {
  ownerFatherName: string | null
  mobile: string | null
  wardId: string
  streetName: string | null
  locality: string | null
  colony: string | null
  city: string | null
  pincode: string | null
  taxRateZone: string | null
  roadType: string | null
  ward: { id: string; name: string; number: number } | null
}

type SurveyListMeta = {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type FormValues = {
  amount: string
  paymentMode: (typeof PAYMENT_MODES)[number]
  payerName: string
  payerMobile: string
  receiptNumber: string
  chequeDdReference: string
  collectionDate: string
  remarks: string
}

function todayInputValue(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function buildAddress(s: SurveyDetail): string {
  const parts = [
    s.houseNo,
    s.streetName,
    s.locality,
    s.colony,
    s.city ?? ULB.nameEn,
    s.pincode,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : "—"
}

export default function OfflinePaymentPage() {
  const [wardId, setWardId] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [lastReceipt, setLastReceipt] =
    React.useState<StaffPaymentReceipt | null>(null)

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  const form = useForm<FormValues>({
    defaultValues: {
      paymentMode: "CASH",
      amount: "",
      payerName: "",
      payerMobile: "",
      receiptNumber: "",
      chequeDdReference: "",
      collectionDate: todayInputValue(),
      remarks: "",
    },
  })

  const paymentMode = form.watch("paymentMode")

  const wardsQuery = useQuery({
    queryKey: ["wards"],
    queryFn: async () => (await api.get<Ward[]>("/api/v1/wards")).data,
  })

  const wardSelectItems = React.useMemo(
    () => [
      { value: "__all__", label: "All wards" },
      ...buildSelectItems(
        wardsQuery.data ?? [],
        (w) => w.id,
        (w) => `${String(w.number).padStart(2, "0")} · ${w.name}`
      ),
    ],
    [wardsQuery.data]
  )

  const surveysQuery = useQuery({
    queryKey: ["offline-surveys", wardId, debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("pageSize", "15")
      if (wardId) params.set("wardId", wardId)
      if (debouncedSearch) params.set("search", debouncedSearch)
      const res = await api.get<SurveyRow[]>(`/api/v1/surveys?${params}`)
      return {
        items: res.data,
        meta: res.meta as SurveyListMeta | undefined,
      }
    },
  })

  const surveyRows = surveysQuery.data?.items ?? []
  const surveyMeta = surveysQuery.data?.meta

  const surveyDetailQuery = useQuery({
    queryKey: ["offline-survey", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () =>
      (await api.get<SurveyDetail>(`/api/v1/surveys/${selectedId}`)).data,
  })

  const survey = surveyDetailQuery.data

  React.useEffect(() => {
    if (!survey) return
    form.setValue("payerName", survey.ownerName ?? "")
    form.setValue("payerMobile", survey.mobile ?? "")
  }, [survey, form])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!survey) {
        throw new Error("Select a property before recording payment")
      }
      if (
        MODES_NEEDING_REF.has(values.paymentMode) &&
        !values.chequeDdReference.trim()
      ) {
        throw new Error("Enter cheque / DD / UPI reference for this mode")
      }
      const collectionDateIso = values.collectionDate
        ? new Date(`${values.collectionDate}T12:00:00`).toISOString()
        : undefined
      const res = await api.post<StaffPaymentReceipt>(
        "/api/v1/payments/offline",
        {
          amount: Number(values.amount),
          paymentMode: values.paymentMode,
          surveyId: survey.id,
          wardId: survey.wardId || survey.ward?.id,
          payerName: values.payerName.trim() || undefined,
          payerMobile: values.payerMobile.trim() || undefined,
          receiptNumber: values.receiptNumber.trim() || undefined,
          chequeDdReference: values.chequeDdReference.trim() || undefined,
          collectionDate: collectionDateIso,
          remarks: values.remarks.trim() || undefined,
        }
      )
      return res.data
    },
    onSuccess: async (receipt) => {
      setLastReceipt(receipt)
      toast.success("Payment received")
      form.setValue("amount", "")
      form.setValue("receiptNumber", "")
      form.setValue("chequeDdReference", "")
      form.setValue("remarks", "")
      const ok = await printOfflinePaymentReceipt(receipt)
      if (!ok) {
        toast.error("Popup blocked. Use Print again after allowing popups.")
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleReprint = async () => {
    if (!lastReceipt) return
    const ok = await printOfflinePaymentReceipt(lastReceipt)
    if (!ok) toast.error("Popup blocked. Please allow popups for this site.")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Offline Collection
          </h1>
          <p className="text-sm text-muted-foreground">
            Counter collection — find property, receive amount, print receipt
          </p>
        </div>
        {lastReceipt ? (
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            onClick={() => void handleReprint()}
          >
            <Printer className="size-4" />
            Print again
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-xl border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Find property</CardTitle>
            <CardDescription>
              Search by survey ID, owner, mobile, property or parcel number
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="w-48 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Ward</Label>
                <Select
                  value={wardId || "__all__"}
                  items={wardSelectItems}
                  onValueChange={(v) => {
                    setWardId(v === "__all__" || !v ? "" : v)
                    setSelectedId(null)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder="All wards" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="__all__"
                      label="All wards"
                      className="cursor-pointer"
                    >
                      All wards
                    </SelectItem>
                    {(wardsQuery.data ?? []).map((w) => (
                      <SelectItem
                        key={w.id}
                        value={w.id}
                        label={`${String(w.number).padStart(2, "0")} · ${w.name}`}
                        className="cursor-pointer"
                      >
                        {String(w.number).padStart(2, "0")} · {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[220px] flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Owner, survey ID, property no..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setSelectedId(null)
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-3 py-2 font-medium">Survey ID</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium">Ward</th>
                    <th className="px-3 py-2 font-medium">Property</th>
                  </tr>
                </thead>
                <tbody>
                  {surveysQuery.isLoading ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        <Loader2 className="mx-auto size-5 animate-spin" />
                      </td>
                    </tr>
                  ) : surveyRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        No properties found
                      </td>
                    </tr>
                  ) : (
                    surveyRows.map((row) => {
                      const active = selectedId === row.id
                      return (
                        <tr
                          key={row.id}
                          className={`cursor-pointer border-b transition-colors ${
                            active ? "bg-primary/10" : "hover:bg-muted/40"
                          }`}
                          onClick={() => setSelectedId(row.id)}
                        >
                          <td className="px-3 py-2 font-medium">
                            {row.surveyId}
                          </td>
                          <td className="px-3 py-2">{row.ownerName ?? "—"}</td>
                          <td className="px-3 py-2">
                            {row.ward
                              ? `${String(row.ward.number).padStart(2, "0")} · ${row.ward.name}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2">{row.propertyNo ?? "—"}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {surveyMeta && surveyMeta.totalPages > 1 ? (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {surveyMeta.page} of {surveyMeta.totalPages} (
                  {surveyMeta.total} records)
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    disabled={page <= 1 || surveysQuery.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    disabled={
                      page >= surveyMeta.totalPages || surveysQuery.isFetching
                    }
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : surveyMeta && surveyMeta.total > 0 ? (
              <p className="text-xs text-muted-foreground">
                {surveyMeta.total}{" "}
                {surveyMeta.total === 1 ? "property" : "properties"}
              </p>
            ) : null}

            {surveyDetailQuery.isFetching ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading property details…
              </div>
            ) : null}

            {survey ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    Selected property
                  </span>
                  <Badge variant="secondary">{survey.surveyId}</Badge>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Owner</dt>
                    <dd className="font-medium">{survey.ownerName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Father / Husband
                    </dt>
                    <dd className="font-medium">
                      {survey.ownerFatherName ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Mobile</dt>
                    <dd className="font-medium">{survey.mobile ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Ward</dt>
                    <dd className="font-medium">
                      {survey.ward
                        ? `${String(survey.ward.number).padStart(2, "0")} · ${survey.ward.name}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Property / Parcel
                    </dt>
                    <dd className="font-medium">
                      {[survey.propertyNo, survey.parcelNo, survey.houseNo]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Use</dt>
                    <dd className="font-medium">{survey.propertyUse ?? "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Address</dt>
                    <dd className="font-medium">{buildAddress(survey)}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a property from the list to continue.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Receive payment</CardTitle>
            <CardDescription>
              Record cash / cheque / DD / UPI and print the municipal receipt
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Amount (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    {...form.register("amount", { required: true })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Mode</Label>
                  <Select
                    value={paymentMode}
                    items={paymentModeItems}
                    onValueChange={(v) =>
                      form.setValue(
                        "paymentMode",
                        (v as FormValues["paymentMode"]) ?? "CASH"
                      )
                    }
                  >
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder="Payment mode" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.map((m) => (
                        <SelectItem key={m} value={m} label={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {MODES_NEEDING_REF.has(paymentMode) ? (
                <div className="space-y-1.5">
                  <Label>Cheque / DD / UPI reference</Label>
                  <Input
                    {...form.register("chequeDdReference", {
                      required: MODES_NEEDING_REF.has(paymentMode),
                    })}
                    placeholder="Instrument or UPI reference"
                  />
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Receipt book number</Label>
                  <Input
                    {...form.register("receiptNumber")}
                    placeholder="Optional — auto if blank"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Collection date</Label>
                  <Input type="date" {...form.register("collectionDate")} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Payer name</Label>
                  <Input {...form.register("payerName")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile</Label>
                  <Input {...form.register("payerMobile")} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Remarks</Label>
                <Input {...form.register("remarks")} />
              </div>

              <Button
                type="submit"
                className="w-full cursor-pointer"
                disabled={mutation.isPending || !survey}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Printer className="size-4" />
                    Receive &amp; Print Receipt
                  </>
                )}
              </Button>
              {!survey ? (
                <p className="text-xs text-muted-foreground">
                  Select a property to enable collection.
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
