"use client"

import * as React from "react"
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type UseFormRegisterReturn,
} from "react-hook-form"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { buildStringSelectItems } from "@workspace/ui/lib/select-items"
import { cn } from "@workspace/ui/lib/utils"

import { formatCatalogLabel } from "@/lib/catalog-labels"
import { sqFtToSqM } from "@/lib/floors"
import { withCurrentOption } from "@/lib/ward1-catalog"

function toSelectValue(value: string): string | null {
  return value === "" ? null : value
}

export function FieldShell({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={id} className="flex-wrap leading-snug">
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function TextField({
  id,
  label,
  register,
  type = "text",
  inputMode,
  required,
  disabled,
  readOnly,
  error,
  hint,
  className,
  inputClassName,
}: {
  id: string
  label: string
  register: UseFormRegisterReturn
  type?: React.ComponentProps<typeof Input>["type"]
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
  error?: string
  hint?: string
  className?: string
  inputClassName?: string
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputClassName)}
        {...register}
      />
    </FieldShell>
  )
}

export function CatalogField<T extends FieldValues>({
  id,
  label,
  control,
  name,
  options,
  required,
  error,
  hint,
  className,
  onValueChange,
}: {
  id: string
  label: string
  control: Control<T>
  name: FieldPath<T>
  options: readonly string[]
  required?: boolean
  error?: string
  hint?: string
  className?: string
  onValueChange?: (value: string) => void
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      <Controller
        name={name}
        control={control}
        rules={required ? { required: `${label} is required` } : undefined}
        render={({ field }) => {
          const optionList = withCurrentOption(options, field.value as string)
          return (
            <Select
              value={toSelectValue((field.value as string) ?? "")}
              items={buildStringSelectItems(optionList, formatCatalogLabel)}
              onValueChange={(value) => {
                const next = value ?? ""
                field.onChange(next)
                onValueChange?.(next)
              }}
            >
              <SelectTrigger
                id={id}
                className="w-full cursor-pointer"
                aria-invalid={error ? true : undefined}
                aria-describedby={
                  error ? `${id}-error` : hint ? `${id}-hint` : undefined
                }
              >
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                className="min-w-(--anchor-width) w-auto max-w-[min(28rem,var(--available-width))]"
              >
                {optionList.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    label={formatCatalogLabel(option)}
                    className="items-start whitespace-normal"
                  >
                    <span className="whitespace-normal break-words">
                      {formatCatalogLabel(option)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }}
      />
    </FieldShell>
  )
}

export function AreaPairField({
  sqFtId,
  sqMId,
  label,
  sqFtRegister,
  sqMValue,
  onSqFtChange,
  error,
  className,
}: {
  sqFtId: string
  sqMId: string
  label: string
  sqFtRegister: UseFormRegisterReturn
  sqMValue: string
  onSqFtChange: (sqFt: string, sqM: string) => void
  error?: string
  className?: string
}) {
  return (
    <div className={cn("grid min-w-0 grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2", className)}>
      <FieldShell id={sqFtId} label={`${label} SqFt`} error={error}>
        <Input
          id={sqFtId}
          inputMode="decimal"
          className="tabular-nums"
          aria-invalid={error ? true : undefined}
          {...sqFtRegister}
          onChange={(event) => {
            void sqFtRegister.onChange(event)
            const raw = event.target.value
            const n = Number(raw)
            if (raw.trim() && Number.isFinite(n)) {
              onSqFtChange(raw, String(sqFtToSqM(n)))
            } else {
              onSqFtChange(raw, "")
            }
          }}
        />
      </FieldShell>
      <FieldShell
        id={sqMId}
        label={`${label} SqMeter`}
        hint="Calculated"
      >
        <Input
          id={sqMId}
          inputMode="decimal"
          readOnly
          disabled
          value={sqMValue}
          className="bg-muted tabular-nums text-muted-foreground"
          aria-readonly="true"
        />
      </FieldShell>
    </div>
  )
}
