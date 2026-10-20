import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import type { ImportErrorRow } from "./types"

export function ImportErrorsTable({ errors }: { errors: ImportErrorRow[] }) {
  if (errors.length === 0) return null
  const errorCount = errors.filter((e) => e.severity !== "warning").length
  const warningCount = errors.length - errorCount
  const showSheet = errors.some((e) => e.sheet)

  return (
    <div className="space-y-2">
      <p
        className={
          errorCount > 0
            ? "text-sm font-medium text-destructive"
            : "text-sm font-medium text-amber-700 dark:text-amber-300"
        }
        role={errorCount > 0 ? "alert" : "status"}
      >
        {errorCount.toLocaleString("en-IN")} error{errorCount === 1 ? "" : "s"},{" "}
        {warningCount.toLocaleString("en-IN")} warning{warningCount === 1 ? "" : "s"}
        {errors.length >= 200 ? " (showing first 200; errors first)" : null}
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table className="min-w-[44rem]">
          <TableHeader>
            <TableRow>
              {showSheet ? <TableHead className="px-4">Sheet</TableHead> : null}
              <TableHead className={showSheet ? undefined : "px-4"}>Row</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Property / Survey ID</TableHead>
              <TableHead>Field</TableHead>
              <TableHead className="px-4">Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.map((err) => (
              <TableRow key={err.id}>
                {showSheet ? (
                  <TableCell className="px-4 whitespace-nowrap">{err.sheet ?? "—"}</TableCell>
                ) : null}
                <TableCell className={showSheet ? "tabular-nums" : "px-4 tabular-nums"}>
                  {err.rowNumber}
                </TableCell>
                <TableCell>
                  <Badge variant={err.severity === "warning" ? "secondary" : "destructive"}>
                    {err.severity === "warning" ? "Warning" : "Error"}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs break-all">{err.surveyId ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{err.field ?? "—"}</TableCell>
                <TableCell className="min-w-[16rem] px-4 whitespace-normal">{err.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
