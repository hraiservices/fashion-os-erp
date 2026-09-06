"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { buildWhatsAppUrl } from "@/lib/business-rules";
import { getPendingOrders } from "@/lib/analytics";
import { fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StageBadge, DueBadge } from "@/components/orders/stage-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

export default function PendingOrdersPage() {
  const { orders, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const pending = useMemo(() => getPendingOrders(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell title="Pending Orders" description={`${pending.length} orders still in progress, soonest delivery first`}>
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {pending.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing pending" description="Every order has been delivered and paid." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Stage</Th>
              <Th>Delivery</Th>
              <Th align="right">Balance</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pending.map((o) => (
              <tr key={o.id} className="hover:bg-muted/30">
                <Td>
                  <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                    {o.id}
                  </Link>
                </Td>
                <Td>
                  <p className="truncate">{o.name}</p>
                  <p className="text-xs text-muted-foreground">{o.mobile}</p>
                </Td>
                <Td>
                  <StageBadge stage={o.status} size="sm" />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="whitespace-nowrap">{fmtDate(o.deliveryDate)}</span>
                    <DueBadge order={o} />
                  </div>
                </Td>
                <Td align="right">{o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}</Td>
                <Td align="right">
                  {o.balance > 0 && <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop)} label={`Payment reminder to ${o.name}`} />}
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
