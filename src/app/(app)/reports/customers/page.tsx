"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getCustomerLifetime } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordGrid } from "@/components/ui/mobile-record-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
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
        <ReportActionsMenu
          rows={clvData.map((c) => ({
            Name: c.name,
            Mobile: c.mobile,
            Orders: c.totalOrders,
            Spent: c.totalSpent,
            AvgOrder: c.avgOrder,
            MonthsActive: c.monthsActive,
            CLVScore: c.clvScore,
          }))}
          filename="customer-lifetime"
          title="Customer Lifetime"
          summaryLines={[`Customers: ${clvData.length}`, `Total spent: ${inr(clvData.reduce((s, c) => s + c.totalSpent, 0))}`]}
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

      {clvData.length === 0 ? (
        <EmptyState icon={Users} title="No customer data yet" />
      ) : (
        <>
          <div className="hidden sm:block">
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
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{clvData.reduce((s, c) => s + c.totalOrders, 0)}</Td>
                  <Td align="right">{inr(clvData.reduce((s, c) => s + c.totalSpent, 0))}</Td>
                  <Td align="right">—</Td>
                  <Td align="right">—</Td>
                  <Td align="right">—</Td>
                </ReportTotalsRow>
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
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" showChevron={false} />
              <MobileRecordGrid
                items={[
                  { label: "Orders", value: clvData.reduce((s, c) => s + c.totalOrders, 0) },
                  { label: "Spent", value: inr(clvData.reduce((s, c) => s + c.totalSpent, 0)) },
                ]}
              />
            </MobileRecordCard>
            {clvData.map((c) => (
              <MobileRecordCard key={c.mobile}>
                <MobileRecordHeader title={c.name} subtitle={c.mobile} value={c.clvScore} showChevron={false} />
                <MobileRecordGrid
                  items={[
                    { label: "Orders", value: c.totalOrders },
                    { label: "Spent", value: inr(c.totalSpent) },
                    { label: "Avg order", value: inr(c.avgOrder) },
                    { label: "Months", value: c.monthsActive },
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
