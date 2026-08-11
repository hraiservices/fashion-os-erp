"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Scissors } from "lucide-react";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { buildCustomerTransactions } from "@/lib/customer-ledger";
import { inr, fmtDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TYPE_STYLE: Record<"stitching" | "retail", string> = {
  stitching: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  retail: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};
const TYPE_LABEL: Record<"stitching" | "retail", string> = {
  stitching: "Stitching Order",
  retail: "Product Sale",
};

/**
 * Combined Stitching Orders + Product Sales statement for one customer — the answer to
 * "these are two separate modules, but I need one document that shows both together."
 * Document-level rows (one per order/invoice), not per individual payment — see the doc
 * comment on buildCustomerTransactions() for why.
 */
export default function CustomerStatementPage({ params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = use(params);
  const { profiles, isLoading } = useCustomerProfiles();
  const { data: allInvoices, isLoading: invoicesLoading } = useSalesInvoices();
  const { data: shop } = useShopSettings();

  const [typeFilter, setTypeFilter] = useState<"all" | "stitching" | "retail">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const cust = profiles.find((c) => c.mobile === mobile);
  const custInvoices = useMemo(() => (allInvoices || []).filter((i) => i.customerMobile === mobile), [allInvoices, mobile]);

  const allTransactions = useMemo(() => buildCustomerTransactions(cust?.orders || [], custInvoices), [cust, custInvoices]);

  const filtered = useMemo(() => {
    return allTransactions.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    });
  }, [allTransactions, typeFilter, from, to]);

  const rows = useMemo(() => {
    let running = 0;
    return filtered.map((t) => {
      running += t.billed - t.paid;
      return { ...t, running };
    });
  }, [filtered]);

  const summary = useMemo(() => {
    const totalBilled = filtered.reduce((s, t) => s + t.billed, 0);
    const totalPaid = filtered.reduce((s, t) => s + t.paid, 0);
    const stitchBalance = filtered.filter((t) => t.type === "stitching").reduce((s, t) => s + t.balance, 0);
    const retailBalance = filtered.filter((t) => t.type === "retail").reduce((s, t) => s + t.balance, 0);
    return { totalBilled, totalPaid, stitchBalance, retailBalance, totalBalance: stitchBalance + retailBalance };
  }, [filtered]);

  if (isLoading || invoicesLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!cust) {
    return (
      <div className="p-6">
        <EmptyState icon={Scissors} title="Customer not found" action={<Button nativeButton={false} render={<Link href="/crm" />}>Back to customers</Button>} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/crm/${mobile}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {cust.name || mobile}
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / Save PDF
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3 print:hidden">
        <div className="flex gap-1">
          {(["all", "stitching", "retail"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setTypeFilter(v)}
              className={cn(
                "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
                typeFilter === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {v === "all" ? "All" : v === "stitching" ? "Stitching Orders" : "Product Sales"}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); }}>
            Clear dates
          </Button>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5 print:border-0 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            {shop?.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logoDataUrl} alt={shop.name || "Shop logo"} className="size-12 rounded-lg border bg-white object-contain" />
            ) : (
              <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Scissors className="size-5" />
              </div>
            )}
            <div>
              <p className="font-semibold">{shop?.name || "Shop"}</p>
              {shop?.phone && <p className="text-xs text-muted-foreground">{shop.phone}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tracking-tight">Customer Statement</p>
            <p className="text-xs text-muted-foreground">Generated {fmtDate(new Date().toISOString())}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 py-4">
          <div>
            <p className="font-medium">{cust.name}</p>
            <p className="text-xs text-muted-foreground">
              {cust.mobile}
              {from || to ? ` · ${from ? fmtDate(from) : "Start"} to ${to ? fmtDate(to) : "Today"}` : " · All time"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-5">
          <div className="bg-card p-3 text-center">
            <p className="text-base font-semibold tabular-nums">{inr(summary.totalBilled)}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Billed</p>
          </div>
          <div className="bg-card p-3 text-center">
            <p className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{inr(summary.totalPaid)}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Paid</p>
          </div>
          <div className="bg-card p-3 text-center">
            <p className="text-base font-semibold tabular-nums">{inr(summary.stitchBalance)}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stitch Due</p>
          </div>
          <div className="bg-card p-3 text-center">
            <p className="text-base font-semibold tabular-nums">{inr(summary.retailBalance)}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Product Sales Due</p>
          </div>
          <div className="col-span-2 bg-card p-3 text-center sm:col-span-1">
            <p className={cn("text-base font-semibold tabular-nums", summary.totalBalance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
              {inr(summary.totalBalance)}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance Due</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="py-10">
            <EmptyState title="No transactions in this range" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-2 font-medium">Date</th>
                  <th className="py-2 pr-2 font-medium">Type</th>
                  <th className="py-2 pr-2 font-medium">Reference</th>
                  <th className="py-2 pr-2 font-medium">Description</th>
                  <th className="py-2 pr-2 text-right font-medium">Billed</th>
                  <th className="py-2 pr-2 text-right font-medium">Paid</th>
                  <th className="py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="py-2 pr-2">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", TYPE_STYLE[t.type])}>
                        {TYPE_LABEL[t.type]}
                      </span>
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <Link href={t.href} className="text-primary hover:underline print:text-foreground print:no-underline">
                        {t.reference}
                      </Link>
                    </td>
                    <td className="max-w-40 truncate py-2 pr-2 text-muted-foreground">{t.description}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{inr(t.billed)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{t.paid > 0 ? inr(t.paid) : "—"}</td>
                    <td className={cn("py-2 text-right font-medium tabular-nums", t.balance > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{inr(t.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
