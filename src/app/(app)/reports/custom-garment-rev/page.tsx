"use client";

import { useMemo } from "react";
import { Shirt } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getCustomGarmentRevenue } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/**
 * ReportsView's `customGarRev`, Stitching_Manager_Pro_v16.html ~line 8111. Rows show as
 * "Standard" until OrderForm collects a custom garment name — see the note in analytics.ts.
 */
export default function CustomGarmentRevPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const customGarRev = useMemo(() => getCustomGarmentRevenue(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell title="Custom Garment Revenue" description="Revenue split between custom-named garments and standard rate-card types">
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {customGarRev.length === 0 ? (
        <EmptyState icon={Shirt} title="No garment revenue yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Garment</Th>
              <Th>Type</Th>
              <Th align="right">Count</Th>
              <Th align="right">Revenue</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {customGarRev.map((g) => (
              <tr key={g.label} className="hover:bg-muted/30">
                <Td className="font-medium">{g.label}</Td>
                <Td>
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      g.isCustom ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {g.isCustom ? "Custom" : "Standard"}
                  </span>
                </Td>
                <Td align="right">{g.count}</Td>
                <Td align="right">{inr(g.revenue)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
