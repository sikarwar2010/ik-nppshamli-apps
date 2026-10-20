"use client"

import {
  Building2,
  Database,
  ExternalLink,
  Percent,
  Wallet,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { citizenPropertyTaxUrl, getCitizenWebUrl } from "@/lib/citizen-web-url"
import { SettingsPageHeader } from "../_components/settings-page-header"
import { ULB } from "@/lib/ulb-branding"

export default function SystemSettingsPage() {
  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="System Settings"
        description="Operational overview for ULB identity, tax configuration, payments, and retention. Editable values that require environment or dedicated modules stay read-only here."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="size-4" aria-hidden />
              </div>
              <div>
                <CardTitle>ULB identity</CardTitle>
                <CardDescription>
                  Branding shown across the portal and citizen surfaces.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-(--card-spacing)">
            <InfoRow label="Organization" value={ULB.nameEn} />
            <InfoRow label="District" value={`${ULB.district}, ${ULB.state}`} />
            <InfoRow
              label="Portal"
              value="Municipal survey & property tax ops"
            />
            <InfoRow label="Citizen web" value={getCitizenWebUrl()} />
          </CardContent>
          <CardFooter>
            <Button
              className="cursor-pointer"
              variant="outline"
              render={
                <a
                  href={citizenPropertyTaxUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Property tax (citizen)
              <ExternalLink className="size-4" aria-hidden />
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Percent className="size-4" aria-hidden />
              </div>
              <div>
                <CardTitle>Tax & rates</CardTitle>
                <CardDescription>
                  Ward tax matrices are managed in Reports with publish
                  controls.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-(--card-spacing)">
            <p className="text-sm text-muted-foreground">
              Configure assessment-year rates, preview demand, and publish
              changes from the Tax Rates workspace. Requires{" "}
              <span className="font-mono text-xs">settings:update</span> /
              report access as configured.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              className="cursor-pointer"
              render={<Link href="/reports/tax-rates" />}
            >
              Open Tax Rates
              <ExternalLink className="size-4" aria-hidden />
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wallet className="size-4" aria-hidden />
              </div>
              <div>
                <CardTitle>Payments</CardTitle>
                <CardDescription>
                  Gateway mode is environment-configured for safety.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-(--card-spacing)">
            <InfoRow
              label="Provider mode"
              value="Set via PAYMENT_PROVIDER (e.g. sandbox, atom)"
            />
            <p className="text-sm text-muted-foreground">
              Live credentials and callback URLs stay on the API host. Do not
              expose gateway secrets in the portal. Citizen online pay runs on
              the public website return URL (`ATOM_RETURN_URL`), not this
              portal.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Database className="size-4" aria-hidden />
              </div>
              <div>
                <CardTitle>Data & retention</CardTitle>
                <CardDescription>
                  Audit and financial history are retained for accountability.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-(--card-spacing)">
            <p className="text-sm text-muted-foreground">
              Audit logs, payments, refunds, and settlements should not be hard
              deleted in normal operations. Database backups and retention
              windows are managed by the hosting environment.
            </p>
            <InfoRow label="Audit trail" value="Append-only application logs" />
            <InfoRow
              label="Backups"
              value="Configured at infrastructure layer"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-28 shrink-0 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  )
}
