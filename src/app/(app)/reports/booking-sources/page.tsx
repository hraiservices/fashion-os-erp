"use client";

import { useMemo } from "react";
import { Megaphone } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getBookingSourceBreakdown } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/** How customers found the shop — "Not recorded" is expected and honest for orders created
 *  before this field existed, or where it was left blank. See order-form.tsx's "How did they
 *  find us?" field and src/lib/analytics.ts getBookingSourceBreakdown. */
export default function BookingSourcesPage() {
  const { orders, isLoading } = useReportsData();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const bookingSourceBreakdown = useMemo(
    () => getBookingSourceBreakdown(orders.filter((o) => isWithinDateRange(o.inDate, range))),
    [orders, range]
  );

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalOrders = bookingSourceBreakdown.reduce((s, r) => s + r.count, 0);

  return (
    <ReportShell title="Booking Sources" description={`${totalOrders} order(s), by how the customer found the company`}>
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {bookingSourceBreakdown.length === 0 ? (
        <EmptyState icon={Megaphone} title="No orders yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Source</Th>
              <Th align="right">Orders</Th>
              <Th align="right">Share</Th>
              <Th align="right">Revenue</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {bookingSourceBreakdown.map((r) => (
              <tr key={r.source} className="hover:bg-muted/30">
                <Td className={r.source === "Not recorded" ? "text-muted-foreground italic" : "font-medium"}>{r.source}</Td>
                <Td align="right">{r.count}</Td>
                <Td align="right">{totalOrders ? Math.round((r.count / totalOrders) * 100) : 0}%</Td>
                <Td align="right">{inr(r.revenue)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
