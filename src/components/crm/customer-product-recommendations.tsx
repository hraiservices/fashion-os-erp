"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, ChevronDown } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { matchProductsForCustomer } from "@/lib/customer-product-matching";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";

/** "What should I sell this customer?" (Phase 4) — reverse of ProductCustomerMatches. */
export function CustomerProductRecommendations({ customer }: { customer: { mobile: string; name: string } }) {
  const { data: products } = useProducts();
  const { data: invoices } = useSalesInvoices();
  const [expanded, setExpanded] = useState(false);

  const matches = useMemo(() => {
    if (!products || !invoices) return [];
    const custInvoices = invoices.filter((i) => i.customerMobile === customer.mobile);
    const productsById = new Map(products.map((p) => [p.id, p]));
    return matchProductsForCustomer(custInvoices, products, productsById);
  }, [customer, products, invoices]);

  if (matches.length === 0) return null;

  const shown = expanded ? matches : matches.slice(0, 5);

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Recommended for {customer.name.split(" ")[0]} · {matches.length}</h2>
      </div>
      <ul className="divide-y">
        {shown.map((m) => (
          <li key={m.product.id} className="flex items-center gap-3 px-4 py-3">
            {m.product.imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.product.imageDataUrl} alt="" className="size-10 shrink-0 rounded-md border object-cover bg-white" />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground text-[10px]">
                No photo
              </div>
            )}
            <div className="min-w-0 flex-1">
              <Link href={`/inventory/products/${m.product.id}/edit`} className="text-sm font-medium hover:underline">
                {m.product.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{m.reasons[0] || "Purchase history match"}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums">{inr(m.product.sellingPrice)}</p>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{m.score}% match</span>
            </div>
          </li>
        ))}
      </ul>
      {matches.length > 5 && (
        <div className="border-t px-4 py-2">
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `Show all ${matches.length}`}
            <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </Button>
        </div>
      )}
    </section>
  );
}
