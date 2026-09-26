"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useTailorName } from "@/hooks/use-employees";
import { getTailorWorkload, type WorkloadStat } from "@/lib/analytics";
import { useTableSort } from "@/hooks/use-table-sort";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

const CAPACITY_STYLE: Record<string, string> = {
  Low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Normal: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  High: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  Overloaded: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const CAPACITY_RANK: Record<string, number> = { Low: 0, Normal: 1, High: 2, Overloaded: 3 };

const SORT_DESC_KEYS = new Set(["active", "overdue", "capacity"]);

export default function TailorWorkloadPage() {
  const { orders, isLoading } = useReportsData();
  const tailorName = useTailorName();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [garmentType, setGarmentType] = useState("all");

  const garmentTypes = useMemo(() => {
    const set = new Set(orders.flatMap((o) => o.garments.map((g) => g.type)).filter(Boolean));
    return Array.from(set).sort();
  }, [orders]);

  const sortComparators = useMemo<Record<string, (a: WorkloadStat, b: WorkloadStat) => number>>(
    () => ({
      tailor: (a, b) => tailorName(a.tailor).localeCompare(tailorName(b.tailor)),
      active: (a, b) => a.active - b.active,
      overdue: (a, b) => a.overdue - b.overdue,
      capacity: (a, b) => CAPACITY_RANK[a.capacity] - CAPACITY_RANK[b.capacity],
    }),
    [tailorName]
  );

  const workload = useMemo(
    () =>
      getTailorWorkload(
        orders
          .filter((o) => isWithinDateRange(o.inDate, range))
          .filter((o) => garmentType === "all" || o.garments.some((g) => g.type === garmentType))
      ),
    [orders, range, garmentType]
  );

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<WorkloadStat>("tailor-workload", sortComparators, SORT_DESC_KEYS);
  const sortedWorkload = applySort(workload);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Tailor Workload"
      description="Who has capacity and who is overloaded right now"
      actions={
        <ReportActionsMenu
          rows={sortedWorkload.map((t) => ({ Tailor: tailorName(t.tailor), "Active orders": t.active, Overdue: t.overdue, Capacity: t.capacity }))}
          filename="tailor-workload"
          title="Tailor Workload"
          summaryLines={[`Tailors: ${workload.length}`, `Total active orders: ${workload.reduce((s, t) => s + t.active, 0)}`]}
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
          <Select value={garmentType} onValueChange={(v) => v && setGarmentType(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{garmentType === "all" ? "All Garment Types" : garmentType}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Garment Types</SelectItem>
              {garmentTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {workload.length === 0 ? (
        <EmptyState icon={Users} title="No workload data yet" description="Assign tailors to orders to see capacity here." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="tailor" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Tailor</Th>
                  <Th align="right" sortKey="active" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Active orders</Th>
                  <Th align="right" sortKey="overdue" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Overdue</Th>
                  <Th sortKey="capacity" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Capacity</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{workload.reduce((s, t) => s + t.active, 0)}</Td>
                  <Td align="right">{workload.reduce((s, t) => s + t.overdue, 0)}</Td>
                  <Td>—</Td>
                </ReportTotalsRow>
                {sortedWorkload.map((t) => (
                  <tr key={t.tailor} className="hover:bg-muted/30">
                    <Td className="font-medium">{tailorName(t.tailor)}</Td>
                    <Td align="right">{t.active}</Td>
                    <Td align="right">{t.overdue > 0 ? <span className="font-medium text-red-600 dark:text-red-400">{t.overdue}</span> : "0"}</Td>
                    <Td>
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${CAPACITY_STYLE[t.capacity]}`}>{t.capacity}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={workload.reduce((s, t) => s + t.active, 0)} showChevron={false} />
              <MobileRecordRow label="Overdue" value={workload.reduce((s, t) => s + t.overdue, 0)} />
            </MobileRecordCard>
            {sortedWorkload.map((t) => (
              <MobileRecordCard key={t.tailor}>
                <MobileRecordHeader title={tailorName(t.tailor)} value={t.active} showChevron={false} />
                <MobileRecordRow
                  label="Overdue"
                  value={t.overdue > 0 ? <span className="font-medium text-red-600 dark:text-red-400">{t.overdue}</span> : "0"}
                />
                <MobileRecordRow
                  label="Capacity"
                  value={<span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${CAPACITY_STYLE[t.capacity]}`}>{t.capacity}</span>}
                />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
