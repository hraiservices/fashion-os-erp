"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useProducts } from "@/hooks/use-products";
import { computeBuyingProfile } from "@/lib/customer-buying-profile";
import { inr, fmtDate } from "@/lib/format";
import type { Product } from "@/lib/types";

/**
 * "Purchase History & Preferences" — Phase 2 of Customer Purchase Intelligence.
 * Computed live from sales_invoices (ready-made retail sales only — stitching orders are a
 * separate concept, see the agreed feature scope). Renders nothing for customers with no
 * retail purchases, so it doesn't clutter profiles for stitching-only customers.
 */
export function CustomerBuyingProfileCard({ mobile }: { mobile: string }) {
  const { data: invoices } = useSalesInvoices();
  const { data: products } = useProducts();

  const profile = useMemo(() => {
    const productsById = new Map<string, Product>((products || []).map((p) => [p.id, p]));
    const custInvoices = (invoices || []).filter((i) => i.customerMobile === mobile);
    return computeBuyingProfile(custInvoices, productsById);
  }, [invoices, products, mobile]);

  if (profile.totalPurchases === 0) return null;

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Buying Profile</h2>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">{profile.totalPurchases}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Purchases</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">{inr(profile.totalSpend)}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total spend</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">{inr(profile.averageOrderValue)}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg. order</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">{profile.lastPurchaseDate ? fmtDate(profile.lastPurchaseDate) : "—"}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last purchase</p>
          </div>
        </div>

        {profile.purchaseCycleDays != null && (
          <p className="text-xs text-muted-foreground">
            Typically buys again every <span className="font-medium text-foreground">~{profile.purchaseCycleDays} days</span>.
          </p>
        )}

        {profile.topCategories.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Top categories</p>
            <div className="space-y-1.5">
              {profile.topCategories.map((c) => (
                <div key={c.category} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs">{c.category}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${c.percent}%` }} />
                  </div>
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{c.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(profile.preferredColors.length > 0 || profile.preferredSizes.length > 0 || profile.preferredFabrics.length > 0) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {profile.preferredColors.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Preferred colors</p>
                <div className="flex flex-wrap gap-1">
                  {profile.preferredColors.map((c) => (
                    <span key={c.value} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{c.value}</span>
                  ))}
                </div>
              </div>
            )}
            {profile.preferredSizes.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Preferred sizes</p>
                <div className="flex flex-wrap gap-1">
                  {profile.preferredSizes.map((s) => (
                    <span key={s.value} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{s.value}</span>
                  ))}
                </div>
              </div>
            )}
            {profile.preferredFabrics.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Preferred fabrics</p>
                <div className="flex flex-wrap gap-1">
                  {profile.preferredFabrics.map((f) => (
                    <span key={f.value} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{f.value}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
