"use client";

import { useMemo } from "react";
import { Printer, Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useTailorName } from "@/hooks/use-employees";
import { getManufacturingTailorStats } from "@/lib/manufacturing";
import { printReport } from "@/lib/export";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function TailorPerformancePage() {
  const { tailorStats, isLoading: reportsLoading } = useReportsData();
  const { data: workOrders, isLoading: woLoading } = useWorkOrders();
  const isLoading = reportsLoading || woLoading;
  const tailorName = useTailorName();

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
        tailorStats.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              printReport(
                "Tailor Performance",
                `<table><thead><tr><th>Tailor</th><th>Active</th><th>Done</th><th>Overdue</th><th>Avg Days</th><th>Revenue</th></tr></thead><tbody>${tailorStats
                  .map((t) => `<tr><td>${tailorName(t.tailor)}</td><td>${t.active}</td><td>${t.done}</td><td>${t.overdue}</td><td>${t.avg}</td><td>${inr(t.revenue)}</td></tr>`)
                  .join("")}</tbody></table>`
              )
            }
          >
            <Printer className="size-4" /> Print
          </Button>
        )
      }
    >
      {tailorStats.length === 0 ? (
        <EmptyState icon={Users} title="No tailor data yet" description="Assign tailors to orders to see performance here." />
      ) : (
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
      )}
    </ReportShell>
  );
}
