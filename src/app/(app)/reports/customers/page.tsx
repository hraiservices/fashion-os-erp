"use client";

import { Download, Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { exportCSV } from "@/lib/export";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** ReportsView's `clvData`, Stitching_Manager_Pro_v16.html ~line 8071. */
export default function CustomerLifetimePage() {
  const { clvData, isLoading } = useReportsData();

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Customer Lifetime"
      description="Ranked by lifetime value (repeat customers weighted higher)"
      actions={
        clvData.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCSV(
                clvData.map((c) => ({
                  Name: c.name,
                  Mobile: c.mobile,
                  Orders: c.totalOrders,
                  Spent: c.totalSpent,
                  AvgOrder: c.avgOrder,
                  MonthsActive: c.monthsActive,
                  CLVScore: c.clvScore,
                })),
                "customer_lifetime"
              )
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
        )
      }
    >
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
