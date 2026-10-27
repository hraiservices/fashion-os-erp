"use client";

import Link from "next/link";
import { ShoppingBagDuotoneIcon } from "@/components/icons/duotone-icons";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { inr } from "@/lib/format";
import { isWithinDateRange } from "@/lib/report-date-range";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const WINDOW_DAYS = 30;

/** Ranks products by quantity sold in the last 30 days (product sales invoices only — stitching
 *  orders aren't broken down by product, only by garment type, same scoping note as the Sales
 *  by Item report this links to). Mirrors Zoho POS's "Top Selling Item" dashboard widget. */
export function TopSellingItemsWidget() {
  const { data: invoices, isLoading } = useSalesInvoices();
  if (isLoading) return <Skeleton className="h-72 w-full" />;

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);
  const range = { from: since.toISOString().slice(0, 10), to: "" };

  const byProduct = new Map<string, { productName: string; qty: number; revenue: number }>();
  (invoices || [])
    .filter((inv) => isWithinDateRange(inv.invoiceDate, range))
    .forEach((inv) => {
      inv.items.forEach((item) => {
        const row = byProduct.get(item.productId) || { productName: item.productName, qty: 0, revenue: 0 };
        row.qty += item.qty;
        row.revenue += item.amount;
        byProduct.set(item.productId, row);
      });
    });

  const top = Array.from(byProduct.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);
  const maxQty = Math.max(1, ...top.map((t) => t.qty));

  return (
    <Link href="/reports/sales/by-item" className="block rounded-xl border bg-card p-5 transition-colors hover:bg-muted/20">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Top Selling Items</h2>
        <span className="text-xs text-muted-foreground">Last {WINDOW_DAYS} days</span>
      </div>
      {top.length === 0 ? (
        <EmptyState icon={ShoppingBagDuotoneIcon} title="No product sales yet" description="Sell a product to see your top items here." className="border-0 py-8" />
      ) : (
        <div className="space-y-2.5">
          {top.map((item, i) => (
            <div key={item.productName} className="flex items-center gap-3 text-xs">
              <span className="w-4 shrink-0 text-right font-semibold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{item.productName}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{item.qty} sold</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (item.qty / maxQty) * 100)}%` }} />
                </div>
              </div>
              <span className="w-16 shrink-0 text-right font-medium tabular-nums">{inr(item.revenue)}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
