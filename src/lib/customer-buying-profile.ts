import type { Product, SalesInvoice } from "@/lib/types";

export interface CategoryShare {
  category: string;
  qty: number;
  percent: number;
}

export interface AttributeCount {
  value: string;
  count: number;
}

export interface CustomerBuyingProfile {
  /** Number of ready-made retail sales invoices — stitching orders are a separate concept (see D). */
  totalPurchases: number;
  totalSpend: number;
  averageOrderValue: number;
  lastPurchaseDate: string | null;
  /** Median gap in days between consecutive invoices — null if fewer than 2 purchases. */
  purchaseCycleDays: number | null;
  topCategories: CategoryShare[];
  preferredColors: AttributeCount[];
  preferredSizes: AttributeCount[];
  preferredFabrics: AttributeCount[];
}

function topN(counts: Map<string, number>, n: number): AttributeCount[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

/**
 * Computed purely from sales_invoices — stitching orders (garment `type` only, no product
 * catalog link) are out of scope per the agreed Phase-2 boundary. Product attributes (category/
 * size/color/fabric) are read from the CURRENT product row via productId, not snapshotted at
 * sale time — acceptable since this only needs to be meaningful for tagged products sold going
 * forward, not a perfect historical record.
 */
export function computeBuyingProfile(invoices: SalesInvoice[], productsById: Map<string, Product>): CustomerBuyingProfile {
  const sorted = [...invoices].sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());

  const totalPurchases = sorted.length;
  const totalSpend = sorted.reduce((s, inv) => s + inv.total, 0);
  const averageOrderValue = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const lastPurchaseDate = sorted.length > 0 ? sorted[sorted.length - 1].invoiceDate : null;

  let purchaseCycleDays: number | null = null;
  if (sorted.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = (new Date(sorted[i].invoiceDate).getTime() - new Date(sorted[i - 1].invoiceDate).getTime()) / 86_400_000;
      if (days > 0) gaps.push(days);
    }
    if (gaps.length > 0) {
      gaps.sort((a, b) => a - b);
      const mid = Math.floor(gaps.length / 2);
      purchaseCycleDays = Math.round(gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2);
    }
  }

  const categoryQty = new Map<string, number>();
  const colorCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  const fabricCounts = new Map<string, number>();
  let totalQty = 0;

  for (const inv of sorted) {
    for (const item of inv.items) {
      const product = productsById.get(item.productId);
      const qty = item.qty || 0;
      totalQty += qty;

      const category = product?.category?.trim() || "Uncategorized";
      categoryQty.set(category, (categoryQty.get(category) || 0) + qty);

      if (product?.color) colorCounts.set(product.color, (colorCounts.get(product.color) || 0) + qty);
      if (product?.size) sizeCounts.set(product.size, (sizeCounts.get(product.size) || 0) + qty);
      if (product?.fabric) fabricCounts.set(product.fabric, (fabricCounts.get(product.fabric) || 0) + qty);
    }
  }

  const topCategories: CategoryShare[] = [...categoryQty.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, qty]) => ({ category, qty, percent: totalQty > 0 ? Math.round((qty / totalQty) * 100) : 0 }));

  return {
    totalPurchases,
    totalSpend,
    averageOrderValue,
    lastPurchaseDate,
    purchaseCycleDays,
    topCategories,
    preferredColors: topN(colorCounts, 3),
    preferredSizes: topN(sizeCounts, 3),
    preferredFabrics: topN(fabricCounts, 3),
  };
}
