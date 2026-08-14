"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, ChevronDown } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useSendRecommendation } from "@/hooks/use-recommend-mutation";
import { matchProductsForCustomer } from "@/lib/customer-product-matching";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

/** "What should I sell this customer?" (Phase 4) — reverse of ProductCustomerMatches. */
export function CustomerProductRecommendations({ customer }: { customer: { mobile: string; name: string } }) {
  const { data: products } = useProducts();
  const { data: invoices } = useSalesInvoices();
  const [expanded, setExpanded] = useState(false);
  const sendRecommendation = useSendRecommendation();

  const matches = useMemo(() => {
    if (!products || !invoices) return [];
    const custInvoices = invoices.filter((i) => i.customerMobile === customer.mobile);
    const productsById = new Map(products.map((p) => [p.id, p]));
    return matchProductsForCustomer(custInvoices, products, productsById);
  }, [customer, products, invoices]);

  async function handleSend(productId: string, productName: string, category: string, price: number, score: number) {
    const res = await sendRecommendation.mutateAsync({
      mobile: customer.mobile,
      customerName: customer.name,
      productId,
      productName,
      category,
      price,
      score,
    });
    if (res.blocked) {
      toast.info(`Already messaged ${customer.name} about this product recently (within ${res.cooldownDays} days).`);
    } else if (res.sentViaApi) {
      toast.success(`WhatsApp message sent to ${customer.name}`);
    }
  }

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
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="shrink-0"
              aria-label={`Send WhatsApp about ${m.product.name}`}
              title="Send WhatsApp"
              disabled={sendRecommendation.isPending}
              onClick={() => handleSend(m.product.id, m.product.name, m.product.category, m.product.sellingPrice, m.score)}
            >
              <WhatsAppIcon className="size-3.5 text-[#25D366]" />
            </Button>
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
