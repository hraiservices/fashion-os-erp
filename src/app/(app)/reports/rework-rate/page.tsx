"use client";

import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useTailorName } from "@/hooks/use-employees";
import { getReworkRate } from "@/lib/analytics";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/** Rework rate per tailor — driven entirely by the manually-set rework flag (order detail
 *  page's "Flag for rework" action), not an automatic quality signal. */
export default function ReworkRatePage() {
  const { orders, isLoading } = useReportsData();
  const tailorName = useTailorName();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const reworkRate = useMemo(() => getReworkRate(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell title="Rework Rate" description="Share of each tailor's orders flagged for rework">
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {reworkRate.length === 0 ? (
        <EmptyState icon={RotateCcw} title="No data yet" description="Assign orders to tailors to see this breakdown." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Tailor</Th>
              <Th align="right">Total orders</Th>
              <Th align="right">Rework count</Th>
              <Th align="right">Rework rate</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {reworkRate.map((r) => (
              <tr key={r.tailor} className="hover:bg-muted/30">
                <Td className="font-medium">{tailorName(r.tailor)}</Td>
                <Td align="right">{r.totalOrders}</Td>
                <Td align="right">{r.reworkCount}</Td>
                <Td align="right" className={r.reworkRate >= 15 ? "font-medium text-destructive" : undefined}>
                  {r.reworkRate}%
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
