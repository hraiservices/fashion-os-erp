"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Package, ShoppingBag, AlertTriangle, Boxes } from "lucide-react";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { isLowStock } from "@/lib/inventory";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export default function InventoryOverviewPage() {
  const { data: rawMaterials, isLoading: loadingMaterials } = useRawMaterials();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const isLoading = loadingMaterials || loadingProducts;

  const lowStockMaterials = useMemo(() => (rawMaterials || []).filter((m) => isLowStock(m.stockQty, m.lowStockAlert)), [rawMaterials]);
  const lowStockProducts = useMemo(() => (products || []).filter((p) => isLowStock(p.stockQty, p.lowStockAlert)), [products]);
  const lowStockCount = lowStockMaterials.length + lowStockProducts.length;

  const rawMaterialValue = useMemo(() => (rawMaterials || []).reduce((s, m) => s + m.stockQty * m.costPerUnit, 0), [rawMaterials]);
  const finishedGoodsValue = useMemo(() => (products || []).reduce((s, p) => s + p.stockQty * p.sellingPrice, 0), [products]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Inventory" description="Raw materials, finished goods stock and low-stock alerts" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Raw Materials" value={rawMaterials?.length ?? 0} icon={Package} href="/inventory/raw-materials" />
        <StatCard label="Products" value={products?.length ?? 0} icon={ShoppingBag} href="/inventory/products" />
        <StatCard label="Inventory Value" value={inr(rawMaterialValue + finishedGoodsValue)} icon={Boxes} />
        <StatCard label="Low Stock Items" value={lowStockCount} icon={AlertTriangle} tone={lowStockCount > 0 ? "warning" : "default"} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Low stock alerts</h2>
        {lowStockCount === 0 ? (
          <EmptyState icon={AlertTriangle} title="Nothing low on stock" description="All raw materials and products are above their alert thresholds." />
        ) : (
          <div className="space-y-2">
            {lowStockMaterials.map((m) => (
              <Link key={m.id} href="/inventory/raw-materials" className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/40">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Raw material</Badge>
                  <span className="font-medium">{m.name}</span>
                </div>
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {m.stockQty} {m.unitName} left
                </span>
              </Link>
            ))}
            {lowStockProducts.map((p) => (
              <Link key={p.id} href="/inventory/products" className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/40">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Product</Badge>
                  <span className="font-medium">{p.name}</span>
                </div>
                <span className="font-medium text-amber-700 dark:text-amber-400">{p.stockQty} pcs left</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
