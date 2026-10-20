"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useReportDateRange } from "@/lib/report-date-range";
import { ShareButton } from "@/components/targets/share-dialog";
import { reportShareMessage, shareDate } from "@/lib/targets-share";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNSET_LEAD_TYPE } from "@/lib/lead-types";

const ALL_LEAD_TYPES = "all";

/**
 * The Settings > Leads category filter, shared by the six lead-sourced Targets reports (owners,
 * pipeline, sources, lost, response, leaderboard — see the report route's `leadType` handling).
 * Hidden entirely when the shop has no types configured, same as the Leads list filter bar.
 */
export function LeadTypeReportFilter({ types, value, onChange }: { types: string[] | undefined; value: string; onChange: (v: string) => void }) {
  if (!types?.length) return null;
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs font-medium text-muted-foreground">Type</Label>
      <Select value={value || ALL_LEAD_TYPES} onValueChange={(v) => v && onChange(v === ALL_LEAD_TYPES ? "" : v)}>
        <SelectTrigger className="h-9 w-44">
          <SelectValue>{(v: unknown) => (v === ALL_LEAD_TYPES ? "All types" : v === UNSET_LEAD_TYPE ? "Not set" : (v as string))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_LEAD_TYPES}>All types</SelectItem>
          {types.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
          <SelectItem value={UNSET_LEAD_TYPE}>Not set</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** Report date range as the Targets API wants it: "All time" becomes a very wide range instead of an empty one (the API would default an empty range to this month). */
export function targetsRange(range: { from: string; to: string }) {
  return { from: range.from || "2000-01-01", to: range.to || "2099-12-31" };
}

export type DateRangeState = ReturnType<typeof useReportDateRange>;

export interface ReportColumn<R> {
  label: string;
  align?: "left" | "right";
  cell: (row: R) => ReactNode;
  /** Plain value for the CSV / print export. */
  exportValue: (row: R) => string | number;
}

/**
 * One layout for all seven Targets reports: filter bar, a table on desktop, cards on a phone, and
 * the usual export / print menu. The first column is the card title; the second is its headline
 * figure; the rest become label/value rows.
 */
export function TargetsReportView<R>({
  title,
  description,
  filename,
  dateRange,
  showDates = true,
  loading,
  error,
  rows,
  columns,
  rowKey,
  summaryLines = [],
  emptyTitle,
  above,
}: {
  title: string;
  description: string;
  filename: string;
  dateRange: DateRangeState;
  showDates?: boolean;
  loading: boolean;
  error?: string;
  rows: R[];
  columns: ReportColumn<R>[];
  rowKey: (row: R, i: number) => string;
  summaryLines?: string[];
  emptyTitle: string;
  above?: ReactNode;
}) {
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = dateRange;
  const [first, second, ...rest] = columns;
  const pathname = usePathname();

  return (
    <ReportShell
      title={title}
      description={description}
      actions={
        <>
          <ShareButton
            title="Share report"
            size="sm"
            disabled={loading || rows.length === 0}
            build={(origin) =>
              reportShareMessage(
                {
                  title,
                  period: showDates && range.from && range.to ? `${shareDate(range.from)} – ${shareDate(range.to)}` : undefined,
                  summaryLines,
                  headers: columns.map((c) => c.label),
                  rows: rows.map((r) => columns.map((c) => String(c.exportValue(r)))),
                  path: pathname,
                },
                { origin }
              )
            }
          />
          <ReportActionsMenu
            rows={rows.map((r) => Object.fromEntries(columns.map((c) => [c.label, c.exportValue(r)])))}
            filename={filename}
            title={title}
            summaryLines={summaryLines}
            hideWhatsApp
          />
        </>
      }
    >
      {showDates && (
        <ReportFilterBar preset={preset} onPresetChange={setPreset} customFrom={customFrom} onCustomFromChange={setCustomFrom} customTo={customTo} onCustomToChange={setCustomTo} resultLabel={loading ? undefined : `${rows.length} row${rows.length === 1 ? "" : "s"}`} />
      )}
      {above}
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  {columns.map((c) => (
                    <Th key={c.label} align={c.align}>
                      {c.label}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={rowKey(r, i)} className="hover:bg-muted/30">
                    {columns.map((c, ci) => (
                      <Td key={c.label} align={c.align} className={ci === 0 ? "font-medium" : undefined}>
                        {c.cell(r)}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            {rows.map((r, i) => (
              <MobileRecordCard key={rowKey(r, i)}>
                <MobileRecordHeader boldTitle title={first.cell(r)} value={second ? second.cell(r) : undefined} showChevron={false} />
                {rest.map((c) => (
                  <MobileRecordRow key={c.label} label={c.label} value={c.cell(r)} />
                ))}
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
