"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useReworkInstances, type ReworkInstanceRow } from "@/hooks/use-rework-instances";
import { useTableSort } from "@/hooks/use-table-sort";
import { useReportDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { fmtDate, fmtTime } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

const SORT_COMPARATORS: Record<string, (a: ReworkInstanceRow, b: ReworkInstanceRow) => number> = {
  flaggedAt: (a, b) => new Date(a.flaggedAt).getTime() - new Date(b.flaggedAt).getTime(),
  order: (a, b) => a.orderId.localeCompare(b.orderId),
  customer: (a, b) => a.customerName.localeCompare(b.customerName),
  mobile: (a, b) => a.customerMobile.localeCompare(b.customerMobile),
  tailor: (a, b) => a.tailorName.localeCompare(b.tailorName),
  garments: (a, b) => a.garmentTypes.join(", ").localeCompare(b.garmentTypes.join(", ")),
  reason: (a, b) => a.reason.localeCompare(b.reason),
  flaggedBy: (a, b) => a.flaggedByName.localeCompare(b.flaggedByName),
  status: (a, b) => Number(!!a.resolvedAt) - Number(!!b.resolvedAt),
};
const SORT_DESC_KEYS = new Set(["flaggedAt"]);

/**
 * Every time an order has been flagged for rework — one row per instance, not an aggregate rate
 * (see Rework Rate for that). Reconstructed server-side from activity_log, since Order.reworkFlag/
 * reworkReason only ever hold the current/most-recent flag, never the full history (see the API
 * route's own comment). An order flagged 3 times over its life shows up here as 3 separate rows.
 */
export default function ReworkInstancesPage() {
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const { data, isLoading, isError, error } = useReworkInstances(range);
  const [status, setStatus] = useState<"all" | "open" | "resolved">("all");
  const [garmentType, setGarmentType] = useState("all");

  const allRows = useMemo(() => data?.rows || [], [data]);
  const garmentTypes = useMemo(() => {
    const set = new Set(allRows.flatMap((r) => r.garmentTypes));
    return Array.from(set).sort();
  }, [allRows]);
  const rows = useMemo(
    () =>
      allRows
        .filter((r) => status === "all" || (status === "open" ? !r.resolvedAt : !!r.resolvedAt))
        .filter((r) => garmentType === "all" || r.garmentTypes.includes(garmentType)),
    [allRows, status, garmentType]
  );

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<ReworkInstanceRow>("rework-instances", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  const openCount = rows.filter((r) => !r.resolvedAt).length;
  const distinctOrders = new Set(rows.map((r) => r.orderId)).size;

  const exportRows = sortedRows.map((r) => ({
    "Flagged At": `${fmtDate(r.flaggedAt)} ${fmtTime(r.flaggedAt)}`,
    Order: r.orderId,
    Customer: r.customerName,
    Mobile: r.customerMobile,
    Tailor: r.tailorName,
    Garments: r.garmentTypes.join(", ") || "—",
    Reason: r.reason,
    "Flagged By": r.flaggedByName,
    Resolved: r.resolvedAt ? `${fmtDate(r.resolvedAt)} ${fmtTime(r.resolvedAt)}` : "Still open",
  }));

  return (
    <ReportShell
      title="Rework Report"
      description="Every time an order was flagged for rework, with the reason, who flagged it, and whether it's since been resolved."
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="rework-report"
          title="Rework Report"
          summaryLines={[`Range: ${DATE_RANGE_PRESET_LABELS[preset]}`, `Rework instances: ${rows.length}`, `Still open: ${openCount}`]}
        />
      }
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        category={
          <div className="flex gap-2">
            <Select value={status} onValueChange={(v) => v && setStatus(v as typeof status)}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue>{status === "all" ? "All" : status === "open" ? "Still open" : "Resolved"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Still open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={garmentType} onValueChange={(v) => v && setGarmentType(v)}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue>{garmentType === "all" ? "All Garment Types" : garmentType}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Garment Types</SelectItem>
                {garmentTypes.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isLoading && <Skeleton className="h-96 w-full" />}

      {isError && <EmptyState icon={RotateCcw} title="Couldn't load this report" description={error instanceof Error ? error.message : "Try again."} />}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Rework instances" value={rows.length} icon={RotateCcw} />
            <StatCard label="Still open" value={openCount} icon={AlertTriangle} tone={openCount > 0 ? "danger" : "default"} />
            <StatCard label="Orders affected" value={distinctOrders} icon={CheckCircle2} />
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={RotateCcw} title="No rework in this range" description="Nothing has been flagged for rework." />
          ) : (
            <>
              <div className="hidden sm:block">
                <ReportTable>
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <Th sortKey="flaggedAt" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Flagged At</Th>
                      <Th sortKey="order" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Order</Th>
                      <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
                      <Th sortKey="mobile" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Mobile</Th>
                      <Th sortKey="tailor" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Tailor</Th>
                      <Th sortKey="garments" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Garments</Th>
                      <Th sortKey="reason" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Reason</Th>
                      <Th sortKey="flaggedBy" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Flagged By</Th>
                      <Th sortKey="status" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Status</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <ReportTotalsRow>
                      <Td colSpan={8}>Total</Td>
                      <Td>{rows.length} instance{rows.length === 1 ? "" : "s"}</Td>
                    </ReportTotalsRow>
                    {sortedRows.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <Td className="whitespace-nowrap text-muted-foreground">
                          {fmtDate(r.flaggedAt)}, {fmtTime(r.flaggedAt)}
                        </Td>
                        <Td className="font-medium">
                          <Link href={`/orders/${r.orderId}`} className="hover:underline">
                            {r.orderId}
                          </Link>
                        </Td>
                        <Td>{r.customerName}</Td>
                        <Td className="text-muted-foreground">{r.customerMobile}</Td>
                        <Td>{r.tailorName}</Td>
                        <Td>{r.garmentTypes.join(", ") || "—"}</Td>
                        <Td className="max-w-xs truncate">{r.reason || "—"}</Td>
                        <Td>{r.flaggedByName}</Td>
                        <Td>
                          {r.resolvedAt ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Resolved {fmtDate(r.resolvedAt)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              Still open
                            </span>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </ReportTable>
              </div>

              <MobileRecordList>
                <MobileRecordCard className="bg-muted/40">
                  <MobileRecordHeader title="Total" value={`${rows.length} instance${rows.length === 1 ? "" : "s"}`} showChevron={false} />
                  <MobileRecordRow label="Still open" value={openCount} />
                  <MobileRecordRow label="Orders affected" value={distinctOrders} />
                </MobileRecordCard>
                {sortedRows.map((r) => (
                  <MobileRecordCard key={r.id} href={`/orders/${r.orderId}`}>
                    <MobileRecordHeader
                      title={r.orderId}
                      subtitle={r.customerName}
                      value={r.resolvedAt ? "Resolved" : "Still open"}
                      valueClassName={r.resolvedAt ? "text-emerald-600 dark:text-emerald-400" : "font-medium text-amber-600 dark:text-amber-400"}
                      showChevron={false}
                    />
                    <MobileRecordRow label="Mobile" value={r.customerMobile} />
                    <MobileRecordRow label="Tailor" value={r.tailorName} />
                    <MobileRecordRow label="Garments" value={r.garmentTypes.join(", ") || "—"} />
                    <MobileRecordRow label="Reason" value={r.reason || "—"} />
                    <MobileRecordRow label="Flagged by" value={r.flaggedByName} />
                    <MobileRecordRow label="Flagged at" value={`${fmtDate(r.flaggedAt)}, ${fmtTime(r.flaggedAt)}`} />
                    {r.resolvedAt && <MobileRecordRow label="Resolved at" value={`${fmtDate(r.resolvedAt)}, ${fmtTime(r.resolvedAt)}`} />}
                  </MobileRecordCard>
                ))}
              </MobileRecordList>
            </>
          )}
        </>
      )}
    </ReportShell>
  );
}
