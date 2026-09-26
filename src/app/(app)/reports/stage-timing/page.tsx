"use client";

import { useMemo, useState } from "react";
import { Clock3, ArrowRight } from "lucide-react";
import { useStageTiming, type StageTimingRow } from "@/hooks/use-stage-timing";
import { useTableSort } from "@/hooks/use-table-sort";
import { useReportDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { fmtDate, fmtTime, fmtMinutes } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StatCard } from "@/components/ui/stat-card";
import { StageBadge } from "@/components/orders/stage-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import Link from "next/link";

const STAGE_BAR_COLOR = "#0ea5e9";

const SORT_COMPARATORS: Record<string, (a: StageTimingRow, b: StageTimingRow) => number> = {
  date: (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
  order: (a, b) => a.orderId.localeCompare(b.orderId),
  customer: (a, b) => a.customerName.localeCompare(b.customerName),
  mobile: (a, b) => a.customerMobile.localeCompare(b.customerMobile),
  minutes: (a, b) => (a.durationMinutes ?? -1) - (b.durationMinutes ?? -1),
  changedBy: (a, b) => a.userName.localeCompare(b.userName),
};
const SORT_DESC_KEYS = new Set(["date", "minutes"]);

/**
 * Every stage-change activity_log line, turned into a duration by comparing it against
 * whatever happened right before it for the same order (see the API route's own comment for why
 * that has to be computed server-side from each order's full history, not filtered client-side
 * from an already-fetched list like most reports here). Answers exactly what was asked: how long
 * each stage takes, who made the change, and on which day — with the aggregate views (avg time
 * per stage, per-employee speed) right alongside the raw audit trail.
 */
export default function StageTimingPage() {
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const { data, isLoading, isError, error } = useStageTiming(range);
  const [toStage, setToStage] = useState("all");

  const allRows = useMemo(() => data?.rows || [], [data]);
  const stages = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allRows) if (r.toStage) map.set(r.toStage, r.toLabel);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allRows]);
  const rows = useMemo(() => (toStage === "all" ? allRows : allRows.filter((r) => r.toStage === toStage)), [allRows, toStage]);

  // When a stage filter is active, the server's byStage/byEmployee/summary (computed over every
  // row) would silently disagree with the now-narrower table — recompute them the same way the
  // API route does (see its own byStage/byEmployee/summary block), but over the filtered rows,
  // so the aggregate views never show numbers for rows the table isn't displaying.
  const timedRows = useMemo(() => rows.filter((r) => r.durationMinutes != null) as (typeof rows[number] & { durationMinutes: number })[], [rows]);
  const byStage = useMemo(() => {
    if (toStage === "all") return data?.byStage || [];
    const buckets = new Map<string, { stage: string; label: string; totalMinutes: number; count: number }>();
    for (const r of timedRows) {
      if (!r.fromStage) continue;
      const bucket = buckets.get(r.fromStage) || { stage: r.fromStage, label: r.fromLabel, totalMinutes: 0, count: 0 };
      bucket.totalMinutes += r.durationMinutes;
      bucket.count += 1;
      buckets.set(r.fromStage, bucket);
    }
    return Array.from(buckets.values())
      .map((b) => ({ stage: b.stage, label: b.label, avgMinutes: Math.round(b.totalMinutes / b.count), count: b.count }))
      .sort((a, b) => b.avgMinutes - a.avgMinutes);
  }, [data, timedRows, toStage]);
  const byEmployee = useMemo(() => {
    if (toStage === "all") return data?.byEmployee || [];
    const buckets = new Map<string, { email: string | null; name: string; totalMinutes: number; count: number }>();
    for (const r of timedRows) {
      const key = r.userEmail || r.userName;
      const bucket = buckets.get(key) || { email: r.userEmail, name: r.userName, totalMinutes: 0, count: 0 };
      bucket.totalMinutes += r.durationMinutes;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
    return Array.from(buckets.values())
      .map((b) => ({ email: b.email, name: b.name, avgMinutes: Math.round(b.totalMinutes / b.count), count: b.count }))
      .sort((a, b) => a.avgMinutes - b.avgMinutes);
  }, [data, timedRows, toStage]);
  const summary = useMemo(() => {
    if (toStage === "all") return data?.summary || { count: 0, avgMinutes: 0 };
    return {
      count: timedRows.length,
      avgMinutes: timedRows.length > 0 ? Math.round(timedRows.reduce((s, r) => s + r.durationMinutes, 0) / timedRows.length) : 0,
    };
  }, [data, timedRows, toStage]);

  const slowestStage = byStage[0]; // already sorted desc by avgMinutes
  const fastestStage = byStage[byStage.length - 1];

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<StageTimingRow>("stage-timing", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  const exportRows = sortedRows.map((r) => ({
    Date: fmtDate(r.changedAt),
    Time: fmtTime(r.changedAt),
    Order: r.orderId,
    Customer: r.customerName,
    Mobile: r.customerMobile,
    From: r.fromLabel,
    To: r.toLabel,
    "Minutes taken": r.durationMinutes ?? "",
    "Changed by": r.userName,
  }));

  return (
    <ReportShell
      title="Stage Change Speed"
      description="How long each stage change takes, who made it, and when — a direct read on employee speed and where orders are getting stuck."
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="stage-timing"
          title="Stage Change Speed"
          summaryLines={[`Range: ${DATE_RANGE_PRESET_LABELS[preset]}`, `Stage changes: ${summary.count}`, `Avg time per change: ${fmtMinutes(summary.avgMinutes)}`]}
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
          <Select value={toStage} onValueChange={(v) => v && setToStage(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{toStage === "all" ? "All Stages" : stages.find(([id]) => id === toStage)?.[1] || toStage}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {stages.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {isLoading && <Skeleton className="h-96 w-full" />}

      {isError && <EmptyState icon={Clock3} title="Couldn't load this report" description={error instanceof Error ? error.message : "Try again."} />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Stage changes" value={summary.count} icon={Clock3} />
            <StatCard label="Avg time per change" value={fmtMinutes(summary.avgMinutes)} icon={Clock3} tone="default" />
            <StatCard label="Slowest stage" value={slowestStage ? `${slowestStage.label} (${fmtMinutes(slowestStage.avgMinutes)})` : "—"} icon={Clock3} tone="danger" />
            <StatCard label="Fastest stage" value={fastestStage ? `${fastestStage.label} (${fmtMinutes(fastestStage.avgMinutes)})` : "—"} icon={Clock3} tone="success" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ReportCard className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Avg time spent in each stage</p>
              {byStage.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No stage changes in this range.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byStage} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} />
                      <Tooltip
                        formatter={(v, _n, item) => [fmtMinutes(Number(v)), `Avg (${item.payload.count} change${item.payload.count === 1 ? "" : "s"})`]}
                        contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
                      />
                      <Bar dataKey="avgMinutes" radius={[4, 4, 0, 0]}>
                        {byStage.map((b) => (
                          <Cell key={b.stage} fill={STAGE_BAR_COLOR} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ReportCard>

            <ReportCard className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee speed (fastest → slowest avg)</p>
              {byEmployee.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No stage changes in this range.</p>
              ) : (
                <div className="space-y-2">
                  {byEmployee.map((e, i) => (
                    <div key={e.email || e.name} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                      <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">#{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{e.count} change{e.count === 1 ? "" : "s"}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{fmtMinutes(e.avgMinutes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </ReportCard>
          </div>

          <ReportCard className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <p className="text-sm font-semibold">Every stage change</p>
              <Link href="/orders?view=board" className="flex items-center gap-1 text-xs text-primary hover:underline">
                View board <ArrowRight className="size-3" />
              </Link>
            </div>
            {rows.length === 0 ? (
              <EmptyState icon={Clock3} title="No stage changes in this range" className="border-0" />
            ) : (
              <>
                <div className="hidden overflow-x-auto sm:block">
                  <ReportTable>
                    <thead className="border-b bg-muted/40">
                      <tr>
                        <Th sortKey="date" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Date</Th>
                        <Th sortKey="order" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Order</Th>
                        <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
                        <Th sortKey="mobile" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Mobile</Th>
                        <Th>From → To</Th>
                        <Th align="right" sortKey="minutes" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Time taken</Th>
                        <Th sortKey="changedBy" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Changed by</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sortedRows.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <Td className="whitespace-nowrap text-muted-foreground">
                            {fmtDate(r.changedAt)}, {fmtTime(r.changedAt)}
                          </Td>
                          <Td className="font-medium">{r.orderId}</Td>
                          <Td>{r.customerName}</Td>
                          <Td className="text-muted-foreground">{r.customerMobile}</Td>
                          <Td>
                            <div className="flex items-center gap-1.5">
                              {r.fromStage ? <StageBadge stage={r.fromStage} size="sm" /> : <span className="text-xs text-muted-foreground">{r.fromLabel}</span>}
                              <ArrowRight className="size-3 text-muted-foreground/50" />
                              {r.toStage ? <StageBadge stage={r.toStage} size="sm" /> : <span className="text-xs text-muted-foreground">{r.toLabel}</span>}
                            </div>
                          </Td>
                          <Td align="right" className="font-semibold tabular-nums">
                            {r.durationMinutes != null ? fmtMinutes(r.durationMinutes) : "—"}
                          </Td>
                          <Td>{r.userName}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </ReportTable>
                </div>

                <MobileRecordList className="p-2">
                  {sortedRows.map((r) => (
                    <MobileRecordCard key={r.id}>
                      <MobileRecordHeader
                        title={r.orderId}
                        subtitle={r.customerName}
                        value={r.durationMinutes != null ? fmtMinutes(r.durationMinutes) : "—"}
                        showChevron={false}
                      />
                      <MobileRecordRow label="Mobile" value={r.customerMobile} />
                      <MobileRecordRow
                        label="Stage"
                        value={
                          <div className="flex items-center gap-1.5">
                            {r.fromStage ? <StageBadge stage={r.fromStage} size="sm" /> : r.fromLabel}
                            <ArrowRight className="size-3 text-muted-foreground/50" />
                            {r.toStage ? <StageBadge stage={r.toStage} size="sm" /> : r.toLabel}
                          </div>
                        }
                      />
                      <MobileRecordRow label="When" value={`${fmtDate(r.changedAt)}, ${fmtTime(r.changedAt)}`} />
                      <MobileRecordRow label="Changed by" value={r.userName} />
                    </MobileRecordCard>
                  ))}
                </MobileRecordList>
              </>
            )}
          </ReportCard>
        </>
      )}
    </ReportShell>
  );
}
