"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Radio, PackageCheck, Wallet } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { buildWhatsAppUrl } from "@/lib/business-rules";
import { getReadyUncollected, getDeliveredUnpaid } from "@/lib/analytics";
import { DEFAULT_STITCHING_WHATSAPP_TEMPLATES } from "@/lib/stitching-whatsapp";
import { inr } from "@/lib/format";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const MAX_ROWS = 6;

/** Dashboard-tile version of /reports/live — the two situations most worth a same-day nudge,
 *  capped to the top few of each so the tile stays a glance rather than a scroll. "Full report"
 *  goes to the real page for the complete list. */
export function LiveReportWidget() {
  const { data: orders, isLoading } = useOrders();
  const { data: shop } = useShopSettings();
  const { data: waTemplates } = useAppSetting("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);

  const readyUncollected = useMemo(() => (orders ? getReadyUncollected(orders) : []), [orders]);
  const deliveredUnpaid = useMemo(() => (orders ? getDeliveredUnpaid(orders) : []), [orders]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const readyBalance = readyUncollected.reduce((s, o) => s + o.balance, 0);
  const unpaidBalance = deliveredUnpaid.reduce((s, o) => s + o.balance, 0);

  return (
    <section className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">LIVE Report</h2>
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Radio className="size-2.5 animate-pulse" /> Live
          </span>
        </div>
        <Link href="/reports/live" className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
          Full report <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <h3 className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <PackageCheck className="size-3.5 text-emerald-600" />
          Ready, not picked up ({readyUncollected.length}{readyBalance > 0 ? ` · ${inr(readyBalance)}` : ""})
        </h3>
        {readyUncollected.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="flex-1 divide-y overflow-y-auto rounded-lg border">
            {readyUncollected.slice(0, MAX_ROWS).map((o) => (
              <li key={o.id} className="flex items-center gap-2 px-3 py-2">
                <Link href={`/orders/${o.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{o.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.id} · {o.daysWaiting} day{o.daysWaiting === 1 ? "" : "s"} waiting</p>
                </Link>
                <WhatsAppIconButton
                  href={buildWhatsAppUrl(o, o.balance > 0 ? "paymentDue" : "ready", shop, waTemplates)}
                  label={`Pickup reminder to ${o.name}`}
                  tone={o.balance > 0 ? "reminder" : "whatsapp"}
                  className="size-8"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <h3 className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Wallet className="size-3.5 text-amber-600" />
          Picked up, not paid ({deliveredUnpaid.length}{unpaidBalance > 0 ? ` · ${inr(unpaidBalance)}` : ""})
        </h3>
        {deliveredUnpaid.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Nothing unpaid.</p>
        ) : (
          <ul className="flex-1 divide-y overflow-y-auto rounded-lg border">
            {deliveredUnpaid.slice(0, MAX_ROWS).map((o) => (
              <li key={o.id} className="flex items-center gap-2 px-3 py-2">
                <Link href={`/orders/${o.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{o.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.id} · {inr(o.balance)} due</p>
                </Link>
                <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop, waTemplates)} label={`Payment reminder to ${o.name}`} tone="reminder" className="size-8" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {readyUncollected.length === 0 && deliveredUnpaid.length === 0 && (
        <EmptyState icon={PackageCheck} title="All caught up" description="Nothing waiting for pickup or payment." className="border-0" />
      )}
    </section>
  );
}
