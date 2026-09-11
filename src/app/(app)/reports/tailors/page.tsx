"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useTailorName } from "@/hooks/use-employees";
import { getManufacturingTailorStats } from "@/lib/manufacturing";
import { getTailorStats } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordGrid } from "@/components/ui/mobile-record-list";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

export default function TailorPerformancePage() {
  const { orders, isLoading: reportsLoading } = useReportsData();
  const { data: workOrders, isLoading: woLoading } = useWorkOrders();
  const isLoading = reportsLoading || woLoading;
  const tailorName = useTailorName();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const tailorStats = useMemo(() => getTailorStats(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  const mfgByTailor = useMemo(() => {
    const stats = getManufacturingTailorStats(workOrders || []);
    return new Map(stats.map((s) => [s.tailor, s]));
  }, [workOrders]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Tailor Performance"
      description="Workload, turnaround and revenue per tailor"
      actions={
        <ReportActionsMenu
          rows={tailorStats.map((t) => ({ Tailor: tailorName(t.tailor), Active: t.active, Done: t.done, Overdue: t.overdue, "Promised Days": t.avg, Revenue: t.revenue }))}
          filename="tailor-performance"
          title="Tailor Performance"
          summaryLines={[`Tailors: ${tailorStats.length}`, `Total revenue: ${inr(tailorStats.reduce((s, t) => s + t.revenue, 0))}`]}
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
      />

      {tailorStats.length === 0 ? (
        <EmptyState icon={Users} title="No tailor data yet" description="Assign tailors to orders to see performance here." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Tailor</Th>
                  <Th align="right">Active</Th>
                  <Th align="right">Done</Th>
                  <Th align="right">Overdue</Th>
                  <Th align="right">Promised days</Th>
                  <Th align="right">Revenue</Th>
                  <Th align="right">Active WOs</Th>
                  <Th align="right">Completed WOs</Th>
                  <Th align="right">Qty produced</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{tailorStats.reduce((s, t) => s + t.active, 0)}</Td>
                  <Td align="right">{tailorStats.reduce((s, t) => s + t.done, 0)}</Td>
                  <Td align="right">{tailorStats.reduce((s, t) => s + t.overdue, 0)}</Td>
                  <Td align="right">—</Td>
                  <Td align="right">{inr(tailorStats.reduce((s, t) => s + t.revenue, 0))}</Td>
                  <Td align="right">—</Td>
                  <Td align="right">—</Td>
                  <Td align="right">—</Td>
                </ReportTotalsRow>
                {tailorStats.map((t) => {
                  const mfg = mfgByTailor.get(t.tailor);
                  return (
                    <tr key={t.tailor} className="hover:bg-muted/30">
                      <Td className="font-medium">{tailorName(t.tailor)}</Td>
                      <Td align="right">{t.active}</Td>
                      <Td align="right">{t.done}</Td>
                      <Td align="right">{t.overdue > 0 ? <span className="font-medium text-red-600 dark:text-red-400">{t.overdue}</span> : "0"}</Td>
                      <Td align="right">{t.avg}</Td>
                      <Td align="right">{inr(t.revenue)}</Td>
                      <Td align="right" className="text-muted-foreground">
                        {mfg?.activeWOs ?? 0}
                      </Td>
                      <Td align="right" className="text-muted-foreground">
                        {mfg?.completedWOs ?? 0}
                      </Td>
                      <Td align="right" className="text-muted-foreground">
                        {mfg?.qtyProduced ?? 0}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </ReportTable>
          </div>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(tailorStats.reduce((s, t) => s + t.revenue, 0))} showChevron={false} />
              <MobileRecordGrid
                items={[
                  { label: "Active", value: tailorStats.reduce((s, t) => s + t.active, 0) },
                  { label: "Done", value: tailorStats.reduce((s, t) => s + t.done, 0) },
                  { label: "Overdue", value: tailorStats.reduce((s, t) => s + t.overdue, 0) },
                  { label: "Promised days", value: "—" },
                  { label: "Active WOs", value: "—" },
                  { label: "Completed WOs", value: "—" },
                  { label: "Qty produced", value: "—" },
                ]}
              />
            </MobileRecordCard>
            {tailorStats.map((t) => {
              const mfg = mfgByTailor.get(t.tailor);
              return (
                <MobileRecordCard key={t.tailor}>
                  <MobileRecordHeader title={tailorName(t.tailor)} value={inr(t.revenue)} showChevron={false} />
                  <MobileRecordGrid
                    items={[
                      { label: "Active", value: t.active },
                      { label: "Done", value: t.done },
                      { label: "Overdue", value: t.overdue > 0 ? <span className="font-medium text-red-600 dark:text-red-400">{t.overdue}</span> : "0" },
                      { label: "Promised days", value: t.avg },
                      { label: "Active WOs", value: mfg?.activeWOs ?? 0, valueClassName: "text-muted-foreground" },
                      { label: "Completed WOs", value: mfg?.completedWOs ?? 0, valueClassName: "text-muted-foreground" },
                      { label: "Qty produced", value: mfg?.qtyProduced ?? 0, valueClassName: "text-muted-foreground" },
                    ]}
                  />
                </MobileRecordCard>
              );
            })}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
