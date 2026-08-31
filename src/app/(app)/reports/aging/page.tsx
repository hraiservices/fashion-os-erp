"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { buildWhatsAppUrl } from "@/lib/business-rules";
import { DEFAULT_STITCHING_WHATSAPP_TEMPLATES } from "@/lib/stitching-whatsapp";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";

const BAND_STYLE: Record<string, string> = {
  Fresh: "bg-muted text-muted-foreground",
  "1-30 days": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "30+ days": "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default function BalanceAgingPage() {
  const { aging, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { data: waTemplates } = useAppSetting("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalDue = aging.reduce((s, o) => s + o.balance, 0);

  return (
    <ReportShell
      title="Balance Aging"
      description={aging.length > 0 ? `${inr(totalDue)} outstanding across ${aging.length} orders` : undefined}
      actions={
        aging.length > 0 && (
          <ExportMenu
            rows={aging.map((o) => ({ Order: o.id, Name: o.name, Mobile: o.mobile, Balance: o.balance, Band: o.agingBand, DaysOverdue: o.daysOver }))}
            filename="balance_aging"
          />
        )
      }
    >
      {aging.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No outstanding balances" description="Every order is fully paid." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Aging</Th>
              <Th align="right">Balance</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {aging.map((o) => (
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
                  <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${BAND_STYLE[o.agingBand]}`}>
                    {o.agingBand}
                    {o.daysOver > 0 ? ` · ${o.daysOver}d` : ""}
                  </span>
                </Td>
                <Td align="right">
                  <BalanceDue amount={o.balance} />
                </Td>
                <Td align="right">
                  <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop, waTemplates)} label={`Payment reminder to ${o.name}`} />
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
