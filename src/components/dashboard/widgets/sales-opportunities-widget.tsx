"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useCustomers } from "@/hooks/use-customers";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useProducts } from "@/hooks/use-products";
import { matchCustomersForProduct, groupInvoicesByMobile } from "@/lib/customer-product-matching";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/** Phase 7: dashboard-level view of the Phase 3 matching engine — "how many customers, across
 *  the whole catalog, are a strong match for something currently in stock?" A higher score
 *  threshold than the per-product list (Phase 3 uses 30) keeps this a meaningful headline
 *  number rather than every marginal match. */
const OPPORTUNITY_MIN_SCORE = 40;

export function SalesOpportunitiesWidget() {
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const { data: invoices, isLoading: invoicesLoading } = useSalesInvoices();
  const { data: products, isLoading: productsLoading } = useProducts();

  const isLoading = customersLoading || invoicesLoading || productsLoading;

  const { totalOpportunities, byCategory } = useMemo(() => {
    if (!customers || !invoices || !products) return { totalOpportunities: 0, byCategory: [] as { category: string; count: number }[] };

    const productsById = new Map(products.map((p) => [p.id, p]));
    const invoicesByMobile = groupInvoicesByMobile(invoices);
    const categoryCounts = new Map<string, number>();
    let total = 0;

    for (const product of products) {
      if (product.stockQty <= 0) continue;
      const matches = matchCustomersForProduct(product, customers, invoicesByMobile, productsById, OPPORTUNITY_MIN_SCORE);
      if (matches.length === 0) continue;
      total += matches.length;
      const category = product.category || "Uncategorized";
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + matches.length);
    }

    const byCategory = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([category, count]) => ({ category, count }));

    return { totalOpportunities: total, byCategory };
  }, [customers, invoices, products]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Link href="/inventory/products" className="block rounded-xl border bg-card transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Sales Opportunities</h2>
      </div>
      <div className="p-4">
        {totalOpportunities === 0 ? (
          <EmptyState icon={Sparkles} title="No strong matches right now" description="Tag more products with size/color/fabric to surface opportunities." className="border-0 p-0" />
        ) : (
          <>
            <p className="text-2xl font-semibold tabular-nums">
              {totalOpportunities} <span className="text-sm font-normal text-muted-foreground">customer-product matches</span>
            </p>
            <div className="mt-3 space-y-1.5">
              {byCategory.map((c) => (
                <div key={c.category} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.category}</span>
                  <span className="font-medium tabular-nums">{c.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
