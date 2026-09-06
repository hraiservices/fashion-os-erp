"use client";

import { useMemo } from "react";
import { Shirt } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getGarmentStats } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

export default function GarmentAnalysisPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const garStats = useMemo(() => getGarmentStats(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const maxCount = Math.max(...garStats.map((g) => g.count), 1);

  return (
    <ReportShell title="Garment Analysis" description="Which garment types you stitch most">
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
              <Th align="right">Count</Th>
              <Th align="right">Revenue</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {garStats.map((g) => (
              <tr key={g.type} className="hover:bg-muted/30">
                <Td className="font-medium">{g.type}</Td>
                <Td className="w-40">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(g.count / maxCount) * 100}%` }} />
                  </div>
                </Td>
                <Td align="right">{g.count}</Td>
                <Td align="right">{inr(g.rev)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
