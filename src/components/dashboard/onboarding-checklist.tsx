"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, Sparkles } from "lucide-react";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useProducts } from "@/hooks/use-products";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "onboarding-checklist-dismissed";

interface ChecklistItem {
  label: string;
  done: boolean;
  href: string;
}

/** Dashboard nudge for a fresh shop — mirrors Zoho's "Getting Started" checklist, but keyed off real data instead of a canned onboarding flow. Auto-hides once everything's done. */
export function OnboardingChecklist() {
  const { data: shop } = useShopSettings();
  const { data: products } = useProducts();
  const { profiles } = useCustomerProfiles();
  const { data: orders } = useOrders();
  const { data: invoices } = useSalesInvoices();

  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setDismissed(localStorage.getItem(DISMISS_KEY) === "1"), 0);
    return () => clearTimeout(t);
  }, []);

  const loaded = shop !== undefined && products !== undefined && orders !== undefined && invoices !== undefined;
  if (!loaded || dismissed) return null;

  const items: ChecklistItem[] = [
    { label: "Add your company logo", done: !!shop?.logoDataUrl, href: "/settings/personalize" },
    { label: "Add your first product", done: (products?.length || 0) > 0, href: "/inventory/products?new=1" },
    { label: "Add a customer", done: profiles.length > 0, href: "/crm/new" },
    { label: "Create your first order", done: (orders?.length || 0) > 0, href: "/orders/new" },
    { label: "Send your first invoice", done: (invoices?.length || 0) > 0, href: "/sales/invoices/new" },
  ];

  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Getting started</h2>
          <span className="text-xs text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss getting started checklist" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <li key={item.label}>
            {item.done ? (
              <span className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="line-through">{item.label}</span>
              </span>
            ) : (
              <Link href={item.href} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted")}>
                <Circle className="size-4 shrink-0 text-muted-foreground" />
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
