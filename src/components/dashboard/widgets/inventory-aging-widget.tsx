"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useFullInventoryLedger } from "@/hooks/use-inventory-ledger";
import { computeInventoryAging, priceAgingInventory, stockKey, AGING_BUCKETS, type AgingBucket } from "@/lib/inventory";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { inr, inrCompact } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

const BUCKET_COLOR: Record<AgingBucket, string> = {
  "0-30 days": "bg-emerald-500",
  "31-60 days": "bg-sky-500",
  "61-90 days": "bg-amber-500",
  "90+ days": "bg-red-500",
};

/** How much stock value has sat unsold for how long, bucketed — mirrors Zoho POS's Inventory
 *  Aging Summary, reusing the same FIFO aging math as the full /reports/inventory/aging report
 *  this links to (so the two never disagree). Flags what's worth clearing/discounting before it
 *  becomes a write-off. */
export function InventoryAgingWidget() {
  const { data: rawMaterials, isLoading: l1 } = useRawMaterials();
  const { data: products, isLoading: l2 } = useProducts();
  const { data: ledger, isLoading: l3 } = useFullInventoryLedger();
  if (l1 || l2 || l3) return <Skeleton className="h-64 w-full" />;

  const costByKey = new Map<string, number>();
  for (const mat of rawMaterials || []) costByKey.set(stockKey("raw_material", mat.id), mat.costPerUnit);
  for (const p of products || []) costByKey.set(stockKey("product", p.id), p.costPrice);

  const batches = computeInventoryAging(ledger || []);
  const priced = priceAgingInventory(batches, costByKey);

  const bucketTotals = new Map<AgingBucket, number>(AGING_BUCKETS.map((b) => [b, 0]));
  for (const item of priced) bucketTotals.set(item.bucket, (bucketTotals.get(item.bucket) || 0) + item.stockValue);
  const totalValue = priced.reduce((s, i) => s + i.stockValue, 0);
  const maxBucket = Math.max(1, ...AGING_BUCKETS.map((b) => bucketTotals.get(b) || 0));
  const staleCount = priced.filter((i) => i.bucket === "90+ days").length;

  return (
    <Link href="/reports/inventory/aging" className="block rounded-xl border bg-card p-5 transition-colors hover:bg-muted/20">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Inventory Aging</h2>
        <span className="text-xs text-muted-foreground">{inr(totalValue)} in stock</span>
      </div>
      {priced.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No stock movements recorded yet.</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {AGING_BUCKETS.map((bucket) => {
              const value = bucketTotals.get(bucket) || 0;
              return (
                <div key={bucket} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-muted-foreground">{bucket}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${BUCKET_COLOR[bucket]}`} style={{ width: `${Math.max(value > 0 ? 3 : 0, (value / maxBucket) * 100)}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right font-medium tabular-nums">{inrCompact(value)}</span>
                </div>
              );
            })}
          </div>
          {staleCount > 0 && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" /> {staleCount} item{staleCount === 1 ? "" : "s"} unsold for 90+ days — worth a discount or clearance
            </p>
          )}
        </>
      )}
    </Link>
  );
}
