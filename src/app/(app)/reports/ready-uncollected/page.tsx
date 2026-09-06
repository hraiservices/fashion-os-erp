"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { buildWhatsAppUrl } from "@/lib/business-rules";
import { getReadyUncollected } from "@/lib/analytics";
import { DEFAULT_STITCHING_WHATSAPP_TEMPLATES } from "@/lib/stitching-whatsapp";
import { fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/** Orders sitting in "ready" the longest without being picked up — distinct from Balance Aging,
 *  which tracks the delivery-date promise, not physical pickup. Excludes orders that reached
 *  "ready" before the ready_at column existed (see src/lib/analytics.ts getReadyUncollected). */
export default function ReadyUncollectedPage() {
  const { orders, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { data: waTemplates } = useAppSetting("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const readyUncollected = useMemo(() => getReadyUncollected(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell title="Ready & Uncollected" description={`${readyUncollected.length} order(s) ready for pickup, longest-waiting first`}>
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {readyUncollected.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nothing waiting" description="Every ready order has been picked up." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th align="right">Days waiting</Th>
              <Th align="right">Balance</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {readyUncollected.map((o) => (
              <tr key={o.id} className="hover:bg-muted/30">
                <Td>
                  <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                    {o.id}
                  </Link>
                  <p className="text-xs text-muted-foreground">Ready since {fmtDate(o.readyAt!.slice(0, 10))}</p>
                </Td>
                <Td>
                  <p className="truncate">{o.name}</p>
                  <p className="text-xs text-muted-foreground">{o.mobile}</p>
                </Td>
                <Td align="right" className={o.daysWaiting >= 7 ? "font-medium text-destructive" : undefined}>
                  {o.daysWaiting}d
                </Td>
                <Td align="right">{o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}</Td>
                <Td align="right">
                  <WhatsAppIconButton href={buildWhatsAppUrl(o, o.balance > 0 ? "paymentDue" : "ready", shop, waTemplates)} label={`Pickup reminder to ${o.name}`} />
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
