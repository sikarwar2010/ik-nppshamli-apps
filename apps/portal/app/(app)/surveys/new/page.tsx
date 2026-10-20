"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams, usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { buildSelectItems } from "@workspace/ui/lib/select-items"

import { useCan } from "@/hooks/use-permission"
import { api } from "@/lib/api"
import {
  isCommercialPropertyUse,
  isMixedPropertyUse,
  parseFloorsRaw,
  validateMixedComposition,
} from "@/lib/floors"
import {
  PORTAL_PARCEL_DIGITS,
  PORTAL_ULB_CODE,
  generateSurveyId,
  parseGisSurveyId,
} from "@/lib/survey-format"
import {
  CITIES,
  COMMERCIAL_USES,
  PROPERTY_OWNERSHIPS,
  PROPERTY_USES,
  RESPONDENT_RELATIONSHIPS,
  ROAD_TYPES,
  SITUATIONS,
  TAX_RATE_ZONES,
  TOILET_TYPES,
  WATER_SOURCES,
  YEARS_OF_CONSTRUCTION,
  YES_NO,
} from "@/lib/ward1-catalog"

import { FloorsEditor } from "../_components/floors-editor"
import { SurveyEditHeader } from "../_components/survey-edit-header"
import {
  AreaPairField,
  CatalogField,
  FieldShell,
  TextField,
} from "../_components/survey-form-fields"
import { SurveyFormSection } from "../_components/survey-form-section"
import { SurveyStickyActions } from "../_components/survey-sticky-actions"
import {
  UnsavedChangesDialog,
  useUnsavedChangesGuard,
} from "../_components/unsaved-changes-guard"
import { UsageCompositionPanel } from "../_components/usage-composition-panel"
import { ULB } from "@/lib/ulb-branding"

type FormValues = {
  surveyId: string
  gisUseCode: string
  wardId: string
  surveyedAt: string
  ownerName: string
  ownerFatherName: string
  mobile: string
  isSlum: string
  parcelNo: string
  propertyNo: string
  respondentName: string
  respondentRelationship: string
  city: string
  pincode: string
  houseNo: string
  streetName: string
  locality: string
  colony: string
  taxRateZone: string
  propertyOwnership: string
  propertyUse: string
  commercial: string
  yearOfConstruction: string
  situation: string
  roadType: string
  floorsRaw: string
  plotAreaSqFt: string
  plotAreaSqMeter: string
  plinthAreaSqFt: string
  plinthAreaSqMeter: string
  totalBuiltUpAreaSqFt: string
  totalBuiltUpAreaSqMeter: string
  hasMunicipalWaterSupply: string
  totalWaterConnections: string
  waterConnectionIdType: string
  toiletType: string
  hasMunicipalWasteService: string
  hasAlternateWater: string
  waterSourceType: string
  ownerAadhaar: string
  electricityId: string
  khasraNo: string
  registryNo: string
  constructedDate: string
  presentHouseNo: string
  presentStreetName: string
  presentLocality: string
  presentColony: string
  presentCity: string
  presentPincode: string
  isSameAsProperty: string
  exemptionType: string
  exemptionApplicable: string
  remark: string
}

type Ward = { id: string; number: number; name: string }

type SurveyRecord = {
  id: string
  surveyId: string
  wardId: string
  status?: string | null
  dataQualityStatus?: string | null
  updatedAt?: string | null
  updatedBy?: { id: string; name: string | null; email?: string | null } | null
  surveyedAt?: string | null
  ownerName?: string | null
  ownerFatherName?: string | null
  mobile?: string | null
  ownerAadhaar?: string | null
  isSlum?: boolean | null
  parcelNo?: string | null
  propertyNo?: string | null
  electricityId?: string | null
  khasraNo?: string | null
  registryNo?: string | null
  constructedDate?: string | null
  respondentName?: string | null
  respondentRelationship?: string | null
  city?: string | null
  pincode?: string | null
  houseNo?: string | null
  streetName?: string | null
  locality?: string | null
  colony?: string | null
  presentHouseNo?: string | null
  presentStreetName?: string | null
  presentLocality?: string | null
  presentColony?: string | null
  presentCity?: string | null
  presentPincode?: string | null
  isSameAsProperty?: boolean | null
  taxRateZone?: string | null
  propertyOwnership?: string | null
  propertyUse?: string | null
  commercial?: string | null
  yearOfConstruction?: string | null
  exemptionType?: string | null
  exemptionApplicable?: boolean | null
  situation?: string | null
  roadType?: string | null
  floorsRaw?: string | null
  plotAreaSqFt?: string | number | null
  plotAreaSqMeter?: string | number | null
  plinthAreaSqFt?: string | number | null
  plinthAreaSqMeter?: string | number | null
  totalBuiltUpAreaSqFt?: string | number | null
  totalBuiltUpAreaSqMeter?: string | number | null
  hasMunicipalWaterSupply?: boolean | null
  hasAlternateWater?: boolean | null
  waterSourceType?: string | null
  totalWaterConnections?: number | null
  waterConnectionIdType?: string | null
  toiletType?: string | null
  hasMunicipalWasteService?: boolean | null
  remark?: string | null
}

const emptyForm: FormValues = {
  surveyId: "",
  gisUseCode: "R",
  wardId: "",
  surveyedAt: "",
  ownerName: "",
  ownerFatherName: "",
  mobile: "",
  isSlum: "No",
  parcelNo: "",
  propertyNo: "",
  respondentName: "",
  respondentRelationship: "",
  city: ULB.town,
  pincode: "",
  houseNo: "",
  streetName: "",
  locality: "",
  colony: "",
  taxRateZone: "",
  propertyOwnership: "",
  propertyUse: "",
  commercial: "",
  yearOfConstruction: "",
  situation: "Interior",
  roadType: "rcc road",
  floorsRaw: "",
  plotAreaSqFt: "",
  plotAreaSqMeter: "",
  plinthAreaSqFt: "",
  plinthAreaSqMeter: "",
  totalBuiltUpAreaSqFt: "",
  totalBuiltUpAreaSqMeter: "",
  hasMunicipalWaterSupply: "No",
  totalWaterConnections: "",
  waterConnectionIdType: "",
  toiletType: "",
  hasMunicipalWasteService: "No",
  hasAlternateWater: "",
  waterSourceType: "",
  ownerAadhaar: "",
  electricityId: "",
  khasraNo: "",
  registryNo: "",
  constructedDate: "",
  presentHouseNo: "",
  presentStreetName: "",
  presentLocality: "",
  presentColony: "",
  presentCity: "",
  presentPincode: "",
  isSameAsProperty: "",
  exemptionType: "",
  exemptionApplicable: "",
  remark: "",
}

function focusFirstError(errors: Record<string, unknown>) {
  const firstKey = Object.keys(errors)[0]
  if (!firstKey) return
  const el =
    document.getElementById(firstKey) ??
    document.querySelector(`[name="${firstKey}"]`) ??
    document.getElementById("floors-editor")
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.focus?.()
  }
}

export default function SurveyFormPage() {
  const params = useParams<{ id?: string }>()
  const pathname = usePathname() ?? ""
  const editPathMatch = pathname.match(/^\/surveys\/([^/]+)\/edit\/?$/)
  const paramId = Array.isArray(params.id) ? params.id[0] : params.id
  // Prefer /edit URL segment so save never mistakes edit for create.
  const surveyRouteId = editPathMatch?.[1] ?? paramId
  const isEdit =
    Boolean(editPathMatch?.[1]) ||
    (Boolean(surveyRouteId) && surveyRouteId !== "new")
  const router = useRouter()
  const qc = useQueryClient()
  const { allowed: canAudit } = useCan("audit:read")
  const cancelHref = isEdit ? `/surveys/${surveyRouteId}` : "/surveys"
  const storagePrefix = `survey-form-section:${surveyRouteId ?? "new"}`

  const wards = useQuery({
    queryKey: ["wards"],
    queryFn: async () => (await api.get<Ward[]>("/api/v1/wards")).data,
  })

  const existing = useQuery({
    queryKey: ["survey", surveyRouteId],
    enabled: isEdit,
    queryFn: async () =>
      (await api.get<SurveyRecord>(`/api/v1/surveys/${surveyRouteId}`)).data,
  })

  const form = useForm<FormValues>({ defaultValues: emptyForm })
  const {
    formState: { isDirty, errors },
  } = form

  const guard = useUnsavedChangesGuard(isDirty)

  React.useEffect(() => {
    if (!existing.data) return
    if (isDirty) return
    form.reset(recordToForm(existing.data))
  }, [existing.data, form, isDirty])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!values.wardId) {
        throw new Error("Select Ward Name")
      }
      const body = toPayload(values, isEdit)
      if (isEdit && surveyRouteId) {
        await api.patch<{ id: string }>(
          `/api/v1/surveys/${surveyRouteId}`,
          body
        )
        return (
          await api.get<SurveyRecord>(`/api/v1/surveys/${surveyRouteId}`)
        ).data
      }
      const created = await api.post<{ id: string }>("/api/v1/surveys", body)
      return { id: created.data.id } as SurveyRecord & { id: string }
    },
    onError: () => {
      toast.error("Unable to save survey. Please try again.")
    },
  })

  const control = form.control
  const plotAreaSqFt = form.watch("plotAreaSqFt")
  const plotAreaSqMeter = form.watch("plotAreaSqMeter")
  const plinthAreaSqFt = form.watch("plinthAreaSqFt")
  const plinthAreaSqMeter = form.watch("plinthAreaSqMeter")
  const totalBuiltUpAreaSqFt = form.watch("totalBuiltUpAreaSqFt")
  const totalBuiltUpAreaSqMeter = form.watch("totalBuiltUpAreaSqMeter")
  const propertyUse = form.watch("propertyUse")
  const floorsRaw = form.watch("floorsRaw")
  const wardId = form.watch("wardId")
  const parcelNo = form.watch("parcelNo")
  const propertyNo = form.watch("propertyNo")
  const gisUseCode = form.watch("gisUseCode")

  const showCommercial = isCommercialPropertyUse(propertyUse)
  const showMixed = isMixedPropertyUse(propertyUse)

  const previewSurveyId = React.useMemo(() => {
    const ward = wards.data?.find((w) => w.id === wardId)
    if (!ward || !parcelNo.trim() || !propertyNo.trim() || !gisUseCode.trim()) {
      return isEdit ? form.getValues("surveyId") || "—" : "—"
    }
    // Existing ids keep their ULB and parcel width (matches the API).
    const current = isEdit ? parseGisSurveyId(form.getValues("surveyId")) : null
    try {
      return generateSurveyId({
        ulbCode: current?.ulbCode ?? PORTAL_ULB_CODE,
        parcelDigits: current?.parcelNo.length ?? PORTAL_PARCEL_DIGITS,
        wardNo: ward.number,
        parcelNo: parcelNo.trim(),
        propertyNo: propertyNo.trim(),
        gisUseCode: gisUseCode.trim(),
      })
    } catch {
      return "—"
    }
  }, [wardId, parcelNo, propertyNo, gisUseCode, wards.data, isEdit, form])

  function jumpToFloors() {
    document
      .getElementById("section-floors")
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
    document.getElementById("floors-editor")?.focus?.()
  }

  function onSubmit(values: FormValues) {
    if (isMixedPropertyUse(values.propertyUse)) {
      const mixedError = validateMixedComposition(
        parseFloorsRaw(values.floorsRaw)
      )
      if (mixedError) {
        form.setError("floorsRaw", { type: "validate", message: mixedError })
        document
          .getElementById("section-classification")
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }
    }
    form.clearErrors("floorsRaw")
    const editingSurveyId = isEdit ? surveyRouteId : undefined
    mutation.mutate(values, {
      onSuccess: async (res) => {
        toast.success(
          editingSurveyId
            ? "Survey updated successfully"
            : "Survey created successfully"
        )
        await qc.invalidateQueries({ queryKey: ["surveys"] })

        if (editingSurveyId) {
          await qc.invalidateQueries({ queryKey: ["survey", editingSurveyId] })
          await qc.invalidateQueries({
            queryKey: ["audit-logs", "Survey", editingSurveyId],
          })
          try {
            if (res && typeof res === "object" && "wardId" in res) {
              form.reset(recordToForm(res as SurveyRecord))
            }
          } catch {
            // Keep the edit page open even if form reset fails.
          }
          // Do not router.push/replace — stay on /surveys/[id]/edit.
          return
        }

        router.push(`/surveys/${res.id}`)
      },
    })
  }

  if (isEdit && existing.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (isEdit && existing.isError) {
    return (
      <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="text-lg font-semibold">Unable to load survey</h1>
        <p className="text-sm text-muted-foreground">
          {existing.error instanceof Error
            ? existing.error.message
            : "Please try again."}
        </p>
        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          onClick={() => void existing.refetch()}
        >
          Retry
        </Button>
      </div>
    )
  }

  const classificationHasError = Boolean(
    errors.propertyUse || errors.commercial || errors.floorsRaw
  )
  const floorsHasError = Boolean(errors.floorsRaw || errors.plotAreaSqFt)
  const ownerHasError = Boolean(errors.wardId)
  const parcelHasError = Boolean(
    errors.parcelNo || errors.propertyNo || errors.gisUseCode
  )

  return (
    <>
      <form
        className="space-y-4 pb-4"
        onSubmit={form.handleSubmit(onSubmit, (submitErrors) => {
          focusFirstError(submitErrors as Record<string, unknown>)
        })}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {isEdit ? "Edit Survey" : "Create Survey"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isEdit
                ? "Review and update survey details for QC."
                : "Enter survey details for this property."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => guard.requestLeave(cancelHref)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="cursor-pointer"
              disabled={mutation.isPending || (isEdit && !isDirty)}
            >
              {mutation.isPending
                ? "Saving…"
                : isEdit
                  ? "Save Changes"
                  : "Save"}
            </Button>
          </div>
        </div>

        {isEdit && existing.data ? (
          <SurveyEditHeader
            surveyId={existing.data.surveyId}
            status={existing.data.status}
            dataQualityStatus={existing.data.dataQualityStatus}
            updatedAt={existing.data.updatedAt}
            updatedByName={
              existing.data.updatedBy?.name ??
              existing.data.updatedBy?.email ??
              null
            }
            detailHref={`/surveys/${surveyRouteId}`}
            canAudit={canAudit}
          />
        ) : null}

        <SurveyFormSection
          id="section-owner"
          title="Survey & Owner"
          description="Owner identity and survey metadata."
          hasError={ownerHasError}
          storageKey={`${storagePrefix}:owner`}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="surveyIdPreview">Survey Id</Label>
            <Input
              id="surveyIdPreview"
              readOnly
              disabled
              value={previewSurveyId}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Generated automatically from ward, parcel, property, and GIS use
              code.
            </p>
          </div>
          <TextField
            id="surveyedAt"
            label="Date of Survey"
            type="datetime-local"
            register={form.register("surveyedAt")}
          />
          <TextField
            id="ownerName"
            label="Owner Name"
            register={form.register("ownerName")}
          />
          <TextField
            id="ownerFatherName"
            label="Owner Father Name"
            register={form.register("ownerFatherName")}
          />
          <TextField
            id="mobile"
            label="Mobile No"
            inputMode="numeric"
            register={form.register("mobile")}
          />
          <FieldShell
            id="wardId"
            label="Ward Name"
            required
            error={errors.wardId ? "Ward is required" : undefined}
          >
            <Controller
              name="wardId"
              control={control}
              rules={{ required: "Ward is required" }}
              render={({ field }) => (
                <Select
                  value={field.value === "" ? null : field.value}
                  items={buildSelectItems(
                    wards.data ?? [],
                    (ward) => ward.id,
                    (ward) => `Ward ${ward.number} — ${ward.name}`
                  )}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger
                    id="wardId"
                    className="w-full cursor-pointer"
                    aria-invalid={errors.wardId ? true : undefined}
                  >
                    <SelectValue placeholder="Select ward" />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {(wards.data ?? []).map((ward) => (
                      <SelectItem
                        key={ward.id}
                        value={ward.id}
                        label={`Ward ${ward.number} — ${ward.name}`}
                      >
                        Ward {ward.number} — {ward.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FieldShell>
          <CatalogField
            id="isSlum"
            label="Is Slum"
            control={control}
            name="isSlum"
            options={YES_NO}
          />
        </SurveyFormSection>

        <SurveyFormSection
          id="section-parcel"
          title="Parcel"
          description="Parcel and property identifiers."
          hasError={parcelHasError}
          storageKey={`${storagePrefix}:parcel`}
        >
          <TextField
            id="parcelNo"
            label="Parcel No"
            required={!isEdit}
            error={errors.parcelNo ? "Parcel No is required" : undefined}
            register={form.register("parcelNo", {
              required: !isEdit ? "Parcel No is required" : false,
            })}
          />
          <TextField
            id="propertyNo"
            label="Property No"
            required={!isEdit}
            error={errors.propertyNo ? "Property No is required" : undefined}
            register={form.register("propertyNo", {
              required: !isEdit ? "Property No is required" : false,
            })}
          />
          <TextField
            id="gisUseCode"
            label="GIS Use Code"
            required
            error={
              errors.gisUseCode
                ? "Enter a single letter GIS use code"
                : undefined
            }
            register={form.register("gisUseCode", {
              required: true,
              maxLength: 1,
              pattern: /^[A-Za-z]$/,
            })}
          />
        </SurveyFormSection>

        <SurveyFormSection
          id="section-respondent"
          title="Respondent"
          description="Person who provided survey answers."
          storageKey={`${storagePrefix}:respondent`}
        >
          <TextField
            id="respondentName"
            label="Respondent Name"
            register={form.register("respondentName")}
          />
          <CatalogField
            id="respondentRelationship"
            label="Respondent Relationship"
            control={control}
            name="respondentRelationship"
            options={RESPONDENT_RELATIONSHIPS}
          />
        </SurveyFormSection>

        <SurveyFormSection
          id="section-address"
          title="Address"
          description="Property location details."
          storageKey={`${storagePrefix}:address`}
        >
          <CatalogField
            id="city"
            label="City"
            control={control}
            name="city"
            options={CITIES}
          />
          <TextField
            id="pincode"
            label="Pincode"
            inputMode="numeric"
            className="sm:max-w-[10rem]"
            register={form.register("pincode")}
          />
          <TextField
            id="houseNo"
            label="House No"
            className="sm:max-w-[10rem]"
            register={form.register("houseNo")}
          />
          <TextField
            id="streetName"
            label="Street Name"
            className="sm:col-span-1 lg:col-span-1"
            register={form.register("streetName")}
          />
          <TextField
            id="locality"
            label="Locality"
            register={form.register("locality")}
          />
          <TextField
            id="colony"
            label="Colony"
            register={form.register("colony")}
          />
        </SurveyFormSection>

        <SurveyFormSection
          id="section-classification"
          title="Classification"
          description="Tax and property classification."
          hasError={classificationHasError}
          storageKey={`${storagePrefix}:classification`}
        >
          <CatalogField
            id="taxRateZone"
            label="Tax Rate Zone"
            control={control}
            name="taxRateZone"
            options={TAX_RATE_ZONES}
          />
          <CatalogField
            id="propertyOwnership"
            label="Property Ownership"
            control={control}
            name="propertyOwnership"
            options={PROPERTY_OWNERSHIPS}
          />
          <CatalogField
            id="propertyUse"
            label="Property Use"
            control={control}
            name="propertyUse"
            options={PROPERTY_USES}
            onValueChange={(value) => {
              if (!isCommercialPropertyUse(value)) {
                form.setValue("commercial", "", { shouldDirty: true })
              }
              if (!isMixedPropertyUse(value)) {
                form.clearErrors("floorsRaw")
              }
            }}
          />
          {showCommercial ? (
            <CatalogField
              id="commercial"
              label="Commercial subtype"
              control={control}
              name="commercial"
              options={COMMERCIAL_USES}
              hint="Commercial subtype for this property."
            />
          ) : null}
          {showMixed ? (
            <UsageCompositionPanel
              floorsRaw={floorsRaw}
              onJumpToFloors={jumpToFloors}
              error={errors.floorsRaw?.message}
            />
          ) : null}
          <CatalogField
            id="yearOfConstruction"
            label="Year of Construction"
            control={control}
            name="yearOfConstruction"
            options={YEARS_OF_CONSTRUCTION}
          />
          <CatalogField
            id="situation"
            label="Situation"
            control={control}
            name="situation"
            options={SITUATIONS}
          />
          <CatalogField
            id="roadType"
            label="Road Type"
            control={control}
            name="roadType"
            options={ROAD_TYPES}
          />
        </SurveyFormSection>

        <SurveyFormSection
          id="section-floors"
          title="Floors & Area"
          description="Floor summary and area measurements."
          hasError={floorsHasError}
          storageKey={`${storagePrefix}:floors`}
          contentClassName="gap-3"
        >
          <AreaPairField
            sqFtId="plotAreaSqFt"
            sqMId="plotAreaSqMeter"
            label="Plot Area"
            sqFtRegister={form.register("plotAreaSqFt")}
            sqMValue={plotAreaSqMeter}
            onSqFtChange={(sqFt, sqM) => {
              form.setValue("plotAreaSqFt", sqFt, { shouldDirty: true })
              form.setValue("plotAreaSqMeter", sqM, { shouldDirty: true })
            }}
          />
          <AreaPairField
            sqFtId="plinthAreaSqFt"
            sqMId="plinthAreaSqMeter"
            label="Plinth Area"
            sqFtRegister={form.register("plinthAreaSqFt")}
            sqMValue={plinthAreaSqMeter}
            onSqFtChange={(sqFt, sqM) => {
              form.setValue("plinthAreaSqFt", sqFt, { shouldDirty: true })
              form.setValue("plinthAreaSqMeter", sqM, { shouldDirty: true })
            }}
          />
          <FieldShell
            id="totalBuiltUpAreaSqFt"
            label="Total Built Up Area SqFt"
            hint="Calculated from floors"
            className="sm:col-span-1"
          >
            <Input
              id="totalBuiltUpAreaSqFt"
              readOnly
              disabled
              value={totalBuiltUpAreaSqFt}
              className="bg-muted text-muted-foreground tabular-nums"
            />
          </FieldShell>
          <FieldShell
            id="totalBuiltUpAreaSqMeter"
            label="Total Built Up Area SqMeter"
            hint="Calculated"
          >
            <Input
              id="totalBuiltUpAreaSqMeter"
              readOnly
              disabled
              value={totalBuiltUpAreaSqMeter}
              className="bg-muted text-muted-foreground tabular-nums"
            />
          </FieldShell>
          <Controller
            name="floorsRaw"
            control={control}
            render={({ field }) => (
              <FloorsEditor
                value={field.value}
                onChange={(next) => {
                  field.onChange(next)
                  if (isMixedPropertyUse(form.getValues("propertyUse"))) {
                    const mixedError = validateMixedComposition(
                      parseFloorsRaw(next)
                    )
                    if (mixedError) {
                      form.setError("floorsRaw", {
                        type: "validate",
                        message: mixedError,
                      })
                    } else {
                      form.clearErrors("floorsRaw")
                    }
                  }
                }}
                propertyUse={propertyUse}
                plotAreaSqFt={plotAreaSqFt}
                plinthAreaSqFt={plinthAreaSqFt}
                error={showMixed ? undefined : errors.floorsRaw?.message}
                onBuiltUpChange={(sqFt, sqM) => {
                  form.setValue("totalBuiltUpAreaSqFt", sqFt, {
                    shouldDirty: true,
                  })
                  form.setValue("totalBuiltUpAreaSqMeter", sqM, {
                    shouldDirty: true,
                  })
                }}
              />
            )}
          />
        </SurveyFormSection>

        <SurveyFormSection
          id="section-municipal"
          title="Municipal Services"
          description="Utilities and municipal service connections."
          defaultOpen={false}
          storageKey={`${storagePrefix}:municipal`}
        >
          <CatalogField
            id="hasMunicipalWaterSupply"
            label="Is Muncipal Water Supply"
            control={control}
            name="hasMunicipalWaterSupply"
            options={YES_NO}
          />
          <TextField
            id="totalWaterConnections"
            label="Total Water Connection"
            inputMode="numeric"
            register={form.register("totalWaterConnections")}
          />
          <TextField
            id="waterConnectionIdType"
            label="Water Connection Id/Type"
            register={form.register("waterConnectionIdType")}
          />
          <CatalogField
            id="toiletType"
            label="Toilet Type"
            control={control}
            name="toiletType"
            options={TOILET_TYPES}
          />
          <CatalogField
            id="hasMunicipalWasteService"
            label="Is Muncipal Waste Service"
            control={control}
            name="hasMunicipalWasteService"
            options={YES_NO}
          />
          <CatalogField
            id="hasAlternateWater"
            label="Alternate Water"
            control={control}
            name="hasAlternateWater"
            options={YES_NO}
          />
          <CatalogField
            id="waterSourceType"
            label="Water Source"
            control={control}
            name="waterSourceType"
            options={WATER_SOURCES}
          />
        </SurveyFormSection>

        <SurveyStickyActions
          isDirty={isDirty}
          isPending={mutation.isPending}
          isEdit={isEdit}
          onCancel={() => guard.requestLeave(cancelHref)}
        />
      </form>

      <UnsavedChangesDialog
        open={guard.dialogOpen}
        onStay={guard.stay}
        onLeave={guard.leave}
      />
    </>
  )
}

function recordToForm(row: SurveyRecord): FormValues {
  const parsed = parseGisSurveyId(row.surveyId)
  return {
    ...emptyForm,
    surveyId: row.surveyId ?? "",
    gisUseCode: parsed?.useLetter ?? "R",
    wardId: row.wardId ?? "",
    surveyedAt: toLocalInput(row.surveyedAt),
    ownerName: row.ownerName ?? "",
    ownerFatherName: row.ownerFatherName ?? "",
    mobile: row.mobile ?? "",
    isSlum: toYesNo(row.isSlum) || "No",
    parcelNo: row.parcelNo ?? "",
    propertyNo: row.propertyNo ?? "",
    respondentName: row.respondentName ?? "",
    respondentRelationship: row.respondentRelationship ?? "",
    city: row.city ?? "",
    pincode: row.pincode ?? "",
    houseNo: row.houseNo ?? "",
    streetName: row.streetName ?? "",
    locality: row.locality ?? "",
    colony: row.colony ?? "",
    taxRateZone: row.taxRateZone ?? "",
    propertyOwnership: row.propertyOwnership ?? "",
    propertyUse: row.propertyUse ?? "",
    commercial: row.commercial ?? "",
    yearOfConstruction: row.yearOfConstruction ?? "",
    situation: row.situation ?? "",
    roadType: row.roadType ?? "",
    floorsRaw: row.floorsRaw ?? "",
    plotAreaSqFt: str(row.plotAreaSqFt),
    plotAreaSqMeter: str(row.plotAreaSqMeter),
    plinthAreaSqFt: str(row.plinthAreaSqFt),
    plinthAreaSqMeter: str(row.plinthAreaSqMeter),
    totalBuiltUpAreaSqFt: str(row.totalBuiltUpAreaSqFt),
    totalBuiltUpAreaSqMeter: str(row.totalBuiltUpAreaSqMeter),
    hasMunicipalWaterSupply: toYesNo(row.hasMunicipalWaterSupply),
    totalWaterConnections: str(row.totalWaterConnections),
    waterConnectionIdType: row.waterConnectionIdType ?? "",
    toiletType: row.toiletType ?? "",
    hasMunicipalWasteService: toYesNo(row.hasMunicipalWasteService),
    hasAlternateWater: toYesNo(row.hasAlternateWater),
    waterSourceType: row.waterSourceType ?? "",
    ownerAadhaar: row.ownerAadhaar ?? "",
    electricityId: row.electricityId ?? "",
    khasraNo: row.khasraNo ?? "",
    registryNo: row.registryNo ?? "",
    constructedDate: row.constructedDate ?? "",
    presentHouseNo: row.presentHouseNo ?? "",
    presentStreetName: row.presentStreetName ?? "",
    presentLocality: row.presentLocality ?? "",
    presentColony: row.presentColony ?? "",
    presentCity: row.presentCity ?? "",
    presentPincode: row.presentPincode ?? "",
    isSameAsProperty: toYesNo(row.isSameAsProperty),
    exemptionType: row.exemptionType ?? "",
    exemptionApplicable: toYesNo(row.exemptionApplicable),
    remark: row.remark ?? "",
  }
}

function toYesNo(value?: boolean | null) {
  if (value == null) return ""
  return value ? "Yes" : "No"
}

function fromYesNo(value: string): boolean | undefined {
  if (value === "Yes") return true
  if (value === "No") return false
  return undefined
}

function str(value?: string | number | null) {
  if (value == null || value === "") return ""
  return String(value)
}

function num(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

function toLocalInput(iso?: string | null) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function emptyToUndef(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function toPayload(values: FormValues, isEdit: boolean) {
  const base = {
    wardId: values.wardId,
    gisUseCode: emptyToUndef(values.gisUseCode),
    surveyedAt: values.surveyedAt
      ? new Date(values.surveyedAt).toISOString()
      : undefined,
    ownerName: emptyToUndef(values.ownerName),
    ownerFatherName: emptyToUndef(values.ownerFatherName),
    mobile: emptyToUndef(values.mobile),
    isSlum: fromYesNo(values.isSlum),
    parcelNo: emptyToUndef(values.parcelNo),
    propertyNo: emptyToUndef(values.propertyNo),
    respondentName: emptyToUndef(values.respondentName),
    respondentRelationship: emptyToUndef(values.respondentRelationship),
    city: emptyToUndef(values.city),
    pincode: emptyToUndef(values.pincode),
    houseNo: emptyToUndef(values.houseNo),
    streetName: emptyToUndef(values.streetName),
    locality: emptyToUndef(values.locality),
    colony: emptyToUndef(values.colony),
    taxRateZone: emptyToUndef(values.taxRateZone),
    propertyOwnership: emptyToUndef(values.propertyOwnership),
    propertyUse: emptyToUndef(values.propertyUse),
    commercial: emptyToUndef(values.commercial),
    yearOfConstruction: emptyToUndef(values.yearOfConstruction),
    situation: emptyToUndef(values.situation),
    roadType: emptyToUndef(values.roadType),
    floorsRaw: emptyToUndef(values.floorsRaw),
    plotAreaSqFt: num(values.plotAreaSqFt),
    plotAreaSqMeter: num(values.plotAreaSqMeter),
    plinthAreaSqFt: num(values.plinthAreaSqFt),
    plinthAreaSqMeter: num(values.plinthAreaSqMeter),
    totalBuiltUpAreaSqFt: num(values.totalBuiltUpAreaSqFt),
    totalBuiltUpAreaSqMeter: num(values.totalBuiltUpAreaSqMeter),
    hasMunicipalWaterSupply: fromYesNo(values.hasMunicipalWaterSupply),
    totalWaterConnections: num(values.totalWaterConnections),
    waterConnectionIdType: emptyToUndef(values.waterConnectionIdType),
    toiletType: emptyToUndef(values.toiletType),
    hasMunicipalWasteService: fromYesNo(values.hasMunicipalWasteService),
    hasAlternateWater: fromYesNo(values.hasAlternateWater),
    waterSourceType: emptyToUndef(values.waterSourceType),
    ownerAadhaar: emptyToUndef(values.ownerAadhaar),
    electricityId: emptyToUndef(values.electricityId),
    khasraNo: emptyToUndef(values.khasraNo),
    registryNo: emptyToUndef(values.registryNo),
    constructedDate: emptyToUndef(values.constructedDate),
    presentHouseNo: emptyToUndef(values.presentHouseNo),
    presentStreetName: emptyToUndef(values.presentStreetName),
    presentLocality: emptyToUndef(values.presentLocality),
    presentColony: emptyToUndef(values.presentColony),
    presentCity: emptyToUndef(values.presentCity),
    presentPincode: emptyToUndef(values.presentPincode),
    isSameAsProperty: fromYesNo(values.isSameAsProperty),
    exemptionType: emptyToUndef(values.exemptionType),
    exemptionApplicable: fromYesNo(values.exemptionApplicable),
    remark: emptyToUndef(values.remark),
  }

  if (isEdit) return base

  return base
}
