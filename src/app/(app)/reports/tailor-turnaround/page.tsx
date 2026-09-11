"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useTailorName } from "@/hooks/use-employees";
import { getTailorTurnaround } from "@/lib/analytics";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { useReportDateRange, isWithinDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordGrid } from "@/components/ui/mobile-record-list";

/** How many days it actually takes each tailor to finish an order — from Received to Ready —
 *  not the promised delivery window (Tailor Performance's "Promised days" column). Filters on
 *  ready_at (when the order was actually finished), so the range picks "orders completed in
 *  this period," matching how a manager would ask "how were turnaround times last month." */
export default function TailorTurnaroundPage() {
  const { orders, isLoading } = useReportsData();
  const tailorName = useTailorName();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange("this-month");

  const stats = useMemo(() => getTailorTurnaround(orders.filter((o) => isWithinDateRange(o.readyAt, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalCompleted = stats.reduce((s, t) => s + t.ordersCompleted, 0);
  const overallAvg = totalCompleted > 0 ? Math.round((stats.reduce((s, t) => s + t.avgDays * t.ordersCompleted, 0) / totalCompleted) * 10) / 10 : 0;
  const exportRows = stats.map((t) => ({
    Tailor: tailorName(t.tailor),
    "Orders completed": t.ordersCompleted,
    "Avg days": t.avgDays,
    "Fastest (days)": t.minDays,
    "Slowest (days)": t.maxDays,
    "On-time %": `${t.onTimePct}%`,
  }));

  return (
    <ReportShell
      title="Tailor Turnaround Time"
      description="Actual days from Received to Ready per tailor, and how often they beat the promised delivery date."
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="tailor-turnaround"
          title="Tailor Turnaround Time"
          summaryLines={[`Range: ${DATE_RANGE_PRESET_LABELS[preset]}`, `Orders completed: ${totalCompleted}`, `Overall avg: ${overallAvg} days`]}
        />
      }
    >
      <ReportFilterBar preset={preset} onPresetChange={setPreset} customFrom={customFrom} onCustomFromChange={setCustomFrom} customTo={customTo} onCustomToChange={setCustomTo} />

      {stats.length === 0 ? (
        <EmptyState icon={Clock} title="No completed orders yet" description="Once orders reach Ready in the selected range, turnaround times will show up here." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Tailor</Th>
                  <Th align="right">Orders completed</Th>
                  <Th align="right">Avg days</Th>
                  <Th align="right">Fastest</Th>
                  <Th align="right">Slowest</Th>
                  <Th align="right">On-time %</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total / overall avg</Td>
                  <Td align="right">{totalCompleted}</Td>
                  <Td align="right">{overallAvg}</Td>
                  <Td align="right">—</Td>
                  <Td align="right">—</Td>
                  <Td align="right">—</Td>
                </ReportTotalsRow>
                {stats.map((t) => (
                  <tr key={t.tailor} className="hover:bg-muted/30">
                    <Td className="font-medium">{tailorName(t.tailor)}</Td>
                    <Td align="right">{t.ordersCompleted}</Td>
                    <Td align="right">{t.avgDays}</Td>
                    <Td align="right" className="text-muted-foreground">{t.minDays}</Td>
                    <Td align="right" className="text-muted-foreground">{t.maxDays}</Td>
                    <Td align="right">
                      <span className={t.onTimePct < 70 ? "font-medium text-red-600 dark:text-red-400" : ""}>{t.onTimePct}%</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total / overall avg" value={`${overallAvg} avg`} showChevron={false} />
              <MobileRecordGrid
                items={[
                  { label: "Orders completed", value: totalCompleted },
                  { label: "Avg days", value: overallAvg },
                  { label: "Fastest", value: "—" },
                  { label: "Slowest", value: "—" },
                  { label: "On-time %", value: "—" },
                ]}
              />
            </MobileRecordCard>
            {stats.map((t) => (
              <MobileRecordCard key={t.tailor}>
                <MobileRecordHeader
                  title={tailorName(t.tailor)}
                  value={`${t.onTimePct}%`}
                  valueClassName={t.onTimePct < 70 ? "font-medium text-red-600 dark:text-red-400" : undefined}
                  showChevron={false}
                />
                <MobileRecordGrid
                  items={[
                    { label: "Orders completed", value: t.ordersCompleted },
                    { label: "Avg days", value: t.avgDays },
                    { label: "Fastest", value: t.minDays, valueClassName: "text-muted-foreground" },
                    { label: "Slowest", value: t.maxDays, valueClassName: "text-muted-foreground" },
                  ]}
                />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
