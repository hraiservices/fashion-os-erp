"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getCustomerLifetime } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/** ReportsView's `clvData`, Stitching_Manager_Pro_v16.html ~line 8071. The date range filters
 *  which orders (by inDate) feed each customer's lifetime totals — this is inherently a
 *  cumulative-to-date metric, so a range narrows the window the "lifetime" is computed over. */
export default function CustomerLifetimePage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const clvData = useMemo(() => getCustomerLifetime(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Customer Lifetime"
      description="Ranked by lifetime value (repeat customers weighted higher)"
      actions={
        clvData.length > 0 && (
          <ExportMenu
            rows={clvData.map((c) => ({
              Name: c.name,
              Mobile: c.mobile,
              Orders: c.totalOrders,
              Spent: c.totalSpent,
              AvgOrder: c.avgOrder,
              MonthsActive: c.monthsActive,
              CLVScore: c.clvScore,
            }))}
            filename="customer_lifetime"
          />
        )
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

      {clvData.length === 0 ? (
        <EmptyState icon={Users} title="No customer data yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Customer</Th>
              <Th align="right">Orders</Th>
              <Th align="right">Spent</Th>
              <Th align="right">Avg order</Th>
              <Th align="right">Months</Th>
              <Th align="right">CLV score</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {clvData.map((c) => (
              <tr key={c.mobile} className="hover:bg-muted/30">
                <Td>
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.mobile}</p>
                </Td>
                <Td align="right">{c.totalOrders}</Td>
                <Td align="right">{inr(c.totalSpent)}</Td>
                <Td align="right">{inr(c.avgOrder)}</Td>
                <Td align="right">{c.monthsActive}</Td>
                <Td align="right" className="font-semibold">
                  {c.clvScore}
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
