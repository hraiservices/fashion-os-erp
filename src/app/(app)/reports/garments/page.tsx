"use client";

import { useMemo } from "react";
import { Shirt } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getGarmentStats } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";

/** Garment-type performance: which garment types bring the most orders, quantity and revenue
 *  over a period — the number every "what should we push more of" conversation starts from. */
export default function GarmentAnalysisPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const garStats = useMemo(() => getGarmentStats(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const maxCount = Math.max(...garStats.map((g) => g.count), 1);
  const totalCount = garStats.reduce((s, g) => s + g.count, 0);
  const totalOrders = garStats.reduce((s, g) => s + g.orders, 0);
  const totalRev = garStats.reduce((s, g) => s + g.rev, 0);
  const exportRows = garStats.map((g) => ({
    "Garment type": g.type,
    Orders: g.orders,
    "Qty stitched": g.count,
    Revenue: g.rev,
    "Share of revenue": totalRev > 0 ? `${Math.round((g.rev / totalRev) * 100)}%` : "0%",
  }));

  return (
    <ReportShell
      title="Garment Analysis"
      description="Which garment types you stitch most, and what they're worth"
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="garment-analysis"
          title="Garment Analysis"
          summaryLines={[`Range: ${DATE_RANGE_PRESET_LABELS[preset]}`, `Total revenue: ${inr(totalRev)}`, `Total qty: ${totalCount}`]}
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

      {garStats.length === 0 ? (
        <EmptyState icon={Shirt} title="No garment data yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Garment</Th>
              <Th>Share</Th>
              <Th align="right">Orders</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Revenue</Th>
              <Th align="right">% of revenue</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td>Total</Td>
              <Td />
              <Td align="right">{totalOrders}</Td>
              <Td align="right">{totalCount}</Td>
              <Td align="right">{inr(totalRev)}</Td>
              <Td align="right">100%</Td>
            </ReportTotalsRow>
            {garStats.map((g) => (
              <tr key={g.type} className="hover:bg-muted/30">
                <Td className="font-medium">{g.type}</Td>
                <Td className="w-40">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(g.count / maxCount) * 100}%` }} />
                  </div>
                </Td>
                <Td align="right">{g.orders}</Td>
                <Td align="right">{g.count}</Td>
                <Td align="right">{inr(g.rev)}</Td>
                <Td align="right" className="text-muted-foreground">{totalRev > 0 ? `${Math.round((g.rev / totalRev) * 100)}%` : "0%"}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
