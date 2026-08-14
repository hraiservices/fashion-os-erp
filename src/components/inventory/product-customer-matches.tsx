"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Users, ChevronDown } from "lucide-react";
import { useCustomers } from "@/hooks/use-customers";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useProducts } from "@/hooks/use-products";
import { useSendRecommendation } from "@/hooks/use-recommend-mutation";
import { matchCustomersForProduct, groupInvoicesByMobile } from "@/lib/customer-product-matching";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import type { Product } from "@/lib/types";

/** "Who should I sell this to?" (Phase 3) — shown on an existing product's edit page. */
export function ProductCustomerMatches({ product }: { product: Product }) {
  const { data: customers } = useCustomers();
  const { data: invoices } = useSalesInvoices();
  const { data: products } = useProducts();
  const [expanded, setExpanded] = useState(false);
  const sendRecommendation = useSendRecommendation();

  const matches = useMemo(() => {
    if (!customers || !invoices || !products) return [];
    const productsById = new Map(products.map((p) => [p.id, p]));
    const invoicesByMobile = groupInvoicesByMobile(invoices);
    return matchCustomersForProduct(product, customers, invoicesByMobile, productsById);
  }, [product, customers, invoices, products]);

  async function handleSend(mobile: string, customerName: string, score: number) {
    const res = await sendRecommendation.mutateAsync({
      mobile,
      customerName,
      productId: product.id,
      productName: product.name,
      category: product.category,
      price: product.sellingPrice,
      score,
    });
    if (res.blocked) {
      toast.info(`Already messaged ${customerName} about this product recently (within ${res.cooldownDays} days).`);
    } else if (res.sentViaApi) {
      toast.success(`WhatsApp message sent to ${customerName}`);
    }
  }

  if (matches.length === 0) return null;

  const shown = expanded ? matches : matches.slice(0, 5);

  return (
    <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
      <div className="flex items-center gap-2 border-b pb-2 mb-4">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
          <Users className="size-3.5 text-primary" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Potential customers · {matches.length}
        </span>
      </div>

      <ul className="divide-y">
        {shown.map((m) => (
          <li key={m.customer.mobile} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <Link href={`/crm/${m.customer.mobile}`} className="text-sm font-medium hover:underline">
                {m.customer.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{m.reasons[0] || "Purchase history match"}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {m.score}% match
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="shrink-0"
              aria-label={`Send WhatsApp to ${m.customer.name}`}
              title="Send WhatsApp"
              disabled={sendRecommendation.isPending}
              onClick={() => handleSend(m.customer.mobile, m.customer.name, m.score)}
            >
              <WhatsAppIcon className="size-3.5 text-[#25D366]" />
            </Button>
          </li>
        ))}
      </ul>

      {matches.length > 5 && (
        <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : `Show all ${matches.length}`}
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </Button>
      )}
    </div>
  );
}
