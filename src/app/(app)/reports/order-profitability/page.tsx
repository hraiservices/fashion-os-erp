"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/** Profit = customer price − manually-entered fabric/other cost (order form's "Costs" section,
 *  itself gated to the same viewReports permission). Only as accurate as whoever fills those
 *  fields in — see src/lib/analytics.ts getOrderProfitability. */
export default function OrderProfitabilityPage() {
  const { data: user } = useCurrentUser();
  const { orderProfitability, isLoading } = useReportsData();
  const canView = !!user?.perms.viewReports;

  if (!canView) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={TrendingUp} title="No access" description="Order profitability is restricted to admins and managers." />
      </div>
    );
  }

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const withCosts = orderProfitability.filter((o) => o.cost > 0);
  const totalProfit = withCosts.reduce((s, o) => s + o.profit, 0);

  return (
    <ReportShell
      title="Order Profitability"
      description={
        withCosts.length > 0
          ? `${withCosts.length} order(s) with cost data · Total profit ${inr(totalProfit)}`
          : "No orders have cost data yet — fill in Fabric/Other cost on the order form to populate this report."
      }
    >
      {withCosts.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No cost data yet" description="Add fabric/other cost on an order to see its profitability here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th align="right">Price</Th>
              <Th align="right">Cost</Th>
              <Th align="right">Profit</Th>
              <Th align="right">Margin</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {withCosts.map((o) => (
              <tr key={o.id} className="hover:bg-muted/30">
                <Td>
                  <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                    {o.id}
                  </Link>
                  <p className="text-xs text-muted-foreground">{fmtDate(o.inDate)}</p>
                </Td>
                <Td className="truncate">{o.name}</Td>
                <Td align="right">{inr(o.total)}</Td>
                <Td align="right">{inr(o.cost)}</Td>
                <Td align="right" className={o.profit < 0 ? "font-medium text-destructive" : "font-medium"}>
                  {inr(o.profit)}
                </Td>
                <Td align="right">{o.marginPct}%</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
