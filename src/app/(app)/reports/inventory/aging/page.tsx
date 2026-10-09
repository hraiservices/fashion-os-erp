"use client";

import { useMemo, useState } from "react";
import { TrendingDown, Boxes } from "lucide-react";
import { ClockDuotoneIcon, WarningDuotoneIcon } from "@/components/icons/duotone-icons";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { useFullInventoryLedger } from "@/hooks/use-inventory-ledger";
import { computeInventoryAging, priceAgingInventory, stockKey, AGING_BUCKETS, type AgingInventoryItem, type AgingBucket } from "@/lib/inventory";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTableSort } from "@/hooks/use-table-sort";

type ItemFilter = "all" | "product" | "raw_material";

const ITEM_FILTER_OPTIONS: { value: ItemFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "product", label: "Products" },
  { value: "raw_material", label: "Raw Materials" },
];

function ItemFilterControl({ value, onChange }: { value: ItemFilter; onChange: (v: ItemFilter) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1" role="group" aria-label="Filter by item type">
      {ITEM_FILTER_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
            value === o.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const BUCKET_TONE: Record<AgingBucket, string> = {
  "0-30 days": "",
  "31-60 days": "",
  "61-90 days": "font-medium text-amber-700 dark:text-amber-400",
  "90+ days": "font-medium text-red-700 dark:text-red-400",
};

const AGING_SORT_COMPARATORS: Record<string, (a: AgingInventoryItem, b: AgingInventoryItem) => number> = {
  name: (a, b) => a.itemId.localeCompare(b.itemId),
  age: (a, b) => a.oldestBatchAgeDays - b.oldestBatchAgeDays,
  stock: (a, b) => a.stockQty - b.stockQty,
  value: (a, b) => a.stockValue - b.stockValue,
  loss: (a, b) => a.accruedHoldingLoss - b.accruedHoldingLoss,
  monthlyLoss: (a, b) => a.monthlyLossRate - b.monthlyLossRate,
};
const AGING_SORT_DESC_KEYS = new Set(["age", "stock", "value", "loss", "monthlyLoss"]);

/**
 * Aging Inventory & Holding-Loss report — how long each item's current stock has sat unsold
 * since it entered (FIFO: oldest unsold batch), and the accruing holding-cost loss that
 * represents (capital tied up + storage/spoilage risk, at HOLDING_COST_RATE_PER_MONTH — see
 * src/lib/inventory.ts). Covers both products (aging = time unsold) and raw materials (aging =
 * time unconsumed).
 */
export default function AgingInventoryReportPage() {
  const { data: rawMaterials, isLoading: loadingMaterials } = useRawMaterials();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: ledger, isLoading: loadingLedger } = useFullInventoryLedger();
  const isLoading = loadingMaterials || loadingProducts || loadingLedger;
  const [itemFilter, setItemFilter] = useState<ItemFilter>("all");

  const nameByKey = useMemo(() => {
    const m = new Map<string, { name: string; category: string; unit: string }>();
    for (const mat of rawMaterials || []) m.set(stockKey("raw_material", mat.id), { name: mat.name, category: mat.category || "—", unit: mat.unitName });
    for (const p of products || []) m.set(stockKey("product", p.id), { name: p.name, category: p.sku, unit: "pcs" });
    return m;
  }, [rawMaterials, products]);

  const costByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const mat of rawMaterials || []) m.set(stockKey("raw_material", mat.id), mat.costPerUnit);
    for (const p of products || []) m.set(stockKey("product", p.id), p.costPrice);
    return m;
  }, [rawMaterials, products]);

  const agingItems = useMemo(() => {
    if (!ledger) return [];
    const batches = computeInventoryAging(ledger);
    return priceAgingInventory(batches, costByKey);
  }, [ledger, costByKey]);

  const filteredItems = useMemo(
    () => agingItems.filter((i) => itemFilter === "all" || i.itemType === itemFilter).filter((i) => nameByKey.has(stockKey(i.itemType, i.itemId))),
    [agingItems, itemFilter, nameByKey]
  );

  const totalValue = useMemo(() => filteredItems.reduce((s, i) => s + i.stockValue, 0), [filteredItems]);
  const totalAccruedLoss = useMemo(() => filteredItems.reduce((s, i) => s + i.accruedHoldingLoss, 0), [filteredItems]);
  const totalMonthlyLoss = useMemo(() => filteredItems.reduce((s, i) => s + i.monthlyLossRate, 0), [filteredItems]);
  const over90Count = useMemo(() => filteredItems.filter((i) => i.bucket === "90+ days").length, [filteredItems]);

  const bucketTotals = useMemo(() => {
    const m = new Map<AgingBucket, number>(AGING_BUCKETS.map((b) => [b, 0]));
    for (const i of filteredItems) m.set(i.bucket, (m.get(i.bucket) || 0) + i.stockValue);
    return m;
  }, [filteredItems]);

  const sort = useTableSort<AgingInventoryItem>("inventory-aging", AGING_SORT_COMPARATORS, AGING_SORT_DESC_KEYS);
  const sortedItems = sort.applySort(filteredItems);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  const rowsForExport = sortedItems.map((i) => {
    const meta = nameByKey.get(stockKey(i.itemType, i.itemId));
    return {
      Type: i.itemType === "product" ? "Product" : "Raw Material",
      Name: meta?.name || "—",
      "Stock on hand": `${i.stockQty} ${meta?.unit || ""}`,
      "Age (oldest unsold batch)": `${i.oldestBatchAgeDays} days`,
      Bucket: i.bucket,
      "Stock value": i.stockValue,
      "Accrued holding loss": Math.round(i.accruedHoldingLoss),
      "Monthly loss rate": Math.round(i.monthlyLossRate),
    };
  });

  return (
    <ReportShell
      title="Aging Inventory"
      description="How long unsold stock has sat since it entered, and the holding-cost loss that's accruing on it"
      actions={
        <ReportActionsMenu
          rows={rowsForExport}
          filename="aging-inventory"
          title="Aging Inventory"
          summaryLines={[`Stock value: ${inr(totalValue)}`, `Accrued holding loss: ${inr(totalAccruedLoss)}`, `Projected loss/month if unsold: ${inr(totalMonthlyLoss)}`]}
        />
      }
    >
      <ItemFilterControl value={itemFilter} onChange={setItemFilter} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Stock Value (aging)" value={inr(totalValue)} icon={Boxes} />
        <StatCard label="Accrued Holding Loss" value={inr(totalAccruedLoss)} icon={TrendingDown} tone={totalAccruedLoss > 0 ? "warning" : "default"} />
        <StatCard label="Projected Loss / Month" value={inr(totalMonthlyLoss)} icon={ClockDuotoneIcon} />
        <StatCard label="Items Aged 90+ Days" value={over90Count} icon={WarningDuotoneIcon} tone={over90Count > 0 ? "warning" : "default"} />
      </div>

      <Tabs defaultValue="aging">
        <TabsList>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="loss">Holding Loss</TabsTrigger>
        </TabsList>

        <TabsContent value="aging" className="space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {AGING_BUCKETS.map((b) => (
              <StatCard key={b} label={b} value={inr(bucketTotals.get(b) || 0)} icon={ClockDuotoneIcon} tone={b === "90+ days" && (bucketTotals.get(b) || 0) > 0 ? "warning" : "default"} />
            ))}
          </div>

          {sortedItems.length === 0 ? (
            <EmptyState icon={Boxes} title="No aging stock" description="Every item currently has no unsold stock on hand." />
          ) : (
            <>
              <MobileRecordList>
                {sortedItems.map((i) => {
                  const meta = nameByKey.get(stockKey(i.itemType, i.itemId));
                  return (
                    <MobileRecordCard key={stockKey(i.itemType, i.itemId)}>
                      <MobileRecordHeader boldTitle title={meta?.name || "—"} subtitle={meta?.category} value={inr(i.stockValue)} showChevron={false} />
                      <MobileRecordRow label="Stock" value={`${i.stockQty} ${meta?.unit || ""}`} />
                      <MobileRecordRow label="Oldest unsold since" value={`${i.oldestBatchAgeDays} days ago`} valueClassName={BUCKET_TONE[i.bucket]} />
                      <MobileRecordRow label="Bucket" value={i.bucket} valueClassName={BUCKET_TONE[i.bucket]} />
                    </MobileRecordCard>
                  );
                })}
              </MobileRecordList>
              <div className="hidden sm:block">
                <ReportTable>
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <Th sortKey="name" currentSort={{ key: sort.sortKey, asc: sort.sortAsc }} onSort={sort.toggleSort}>Name</Th>
                      <Th>Category</Th>
                      <Th align="right" sortKey="stock" currentSort={{ key: sort.sortKey, asc: sort.sortAsc }} onSort={sort.toggleSort}>Stock</Th>
                      <Th align="right" sortKey="age" currentSort={{ key: sort.sortKey, asc: sort.sortAsc }} onSort={sort.toggleSort}>Age (oldest batch)</Th>
                      <Th>Bucket</Th>
                      <Th align="right" sortKey="value" currentSort={{ key: sort.sortKey, asc: sort.sortAsc }} onSort={sort.toggleSort}>Stock value</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <ReportTotalsRow>
                      <Td colSpan={5}>Total aging stock value</Td>
                      <Td align="right">{inr(totalValue)}</Td>
                    </ReportTotalsRow>
                    {sortedItems.map((i) => {
                      const meta = nameByKey.get(stockKey(i.itemType, i.itemId));
                      return (
                        <tr key={stockKey(i.itemType, i.itemId)} className="hover:bg-muted/30">
                          <Td className="font-medium">{meta?.name || "—"}</Td>
                          <Td>{meta?.category}</Td>
                          <Td align="right">{i.stockQty} {meta?.unit}</Td>
                          <Td align="right" className={BUCKET_TONE[i.bucket]}>{i.oldestBatchAgeDays} days</Td>
                          <Td className={BUCKET_TONE[i.bucket]}>{i.bucket}</Td>
                          <Td align="right">{inr(i.stockValue)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ReportTable>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="loss" className="space-y-3 pt-3">
          <p className="text-xs text-muted-foreground">
            Holding loss assumes a 2%/month cost of unsold capital + storage/spoilage risk. &quot;Accrued&quot; is the loss racked up so far on stock still unsold; &quot;Monthly rate&quot; is how
            much more it grows every additional month it stays unsold.
          </p>
          {sortedItems.length === 0 ? (
            <EmptyState icon={TrendingDown} title="No holding loss" description="Every item currently has no unsold stock on hand." />
          ) : (
            <>
              <MobileRecordList>
                {sortedItems.map((i) => {
                  const meta = nameByKey.get(stockKey(i.itemType, i.itemId));
                  return (
                    <MobileRecordCard key={stockKey(i.itemType, i.itemId)}>
                      <MobileRecordHeader boldTitle title={meta?.name || "—"} subtitle={meta?.category} value={inr(i.accruedHoldingLoss)} showChevron={false} />
                      <MobileRecordRow label="Stock value" value={inr(i.stockValue)} />
                      <MobileRecordRow label="Age" value={`${i.oldestBatchAgeDays} days`} />
                      <MobileRecordRow label="Loss / month if unsold" value={inr(i.monthlyLossRate)} />
                    </MobileRecordCard>
                  );
                })}
              </MobileRecordList>
              <div className="hidden sm:block">
                <ReportTable>
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <Th sortKey="name" currentSort={{ key: sort.sortKey, asc: sort.sortAsc }} onSort={sort.toggleSort}>Name</Th>
                      <Th align="right" sortKey="value" currentSort={{ key: sort.sortKey, asc: sort.sortAsc }} onSort={sort.toggleSort}>Stock value</Th>
                      <Th align="right" sortKey="age" currentSort={{ key: sort.sortKey, asc: sort.sortAsc }} onSort={sort.toggleSort}>Age</Th>
                      <Th align="right" sortKey="loss" currentSort={{ key: sort.sortKey, asc: sort.sortAsc }} onSort={sort.toggleSort}>Accrued loss</Th>
                      <Th align="right" sortKey="monthlyLoss" currentSort={{ key: sort.sortKey, asc: sort.sortAsc }} onSort={sort.toggleSort}>Loss / month</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <ReportTotalsRow>
                      <Td colSpan={3}>Total</Td>
                      <Td align="right">{inr(totalAccruedLoss)}</Td>
                      <Td align="right">{inr(totalMonthlyLoss)}</Td>
                    </ReportTotalsRow>
                    {sortedItems.map((i) => {
                      const meta = nameByKey.get(stockKey(i.itemType, i.itemId));
                      return (
                        <tr key={stockKey(i.itemType, i.itemId)} className="hover:bg-muted/30">
                          <Td className="font-medium">{meta?.name || "—"}</Td>
                          <Td align="right">{inr(i.stockValue)}</Td>
                          <Td align="right">{i.oldestBatchAgeDays} days</Td>
                          <Td align="right" className="font-medium text-amber-700 dark:text-amber-400">{inr(i.accruedHoldingLoss)}</Td>
                          <Td align="right">{inr(i.monthlyLossRate)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ReportTable>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </ReportShell>
  );
}
