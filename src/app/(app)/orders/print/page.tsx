"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, Printer, Scissors } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { inr, fmtDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shop-wide printable list of stitching orders for a chosen date range — every customer's
 * orders together, one row each with payment status/total/due, as opposed to a single
 * customer's own Statement (src/app/(app)/crm/[mobile]/statement). "Print list" from the
 * Orders page header.
 */
export default function OrdersPrintPage() {
  const { data: orders, isLoading } = useOrders();
  const { data: shop } = useShopSettings();

  const [dateField, setDateField] = useState<"order" | "delivery">("order");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    return (orders || [])
      .filter((o) => {
        const d = dateField === "delivery" ? o.deliveryDate : o.inDate;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .sort((a, b) => {
        const da = dateField === "delivery" ? a.deliveryDate : a.inDate;
        const db = dateField === "delivery" ? b.deliveryDate : b.inDate;
        return da.localeCompare(db);
      });
  }, [orders, dateField, from, to]);

  const totalBilled = filtered.reduce((s, o) => s + (o.total || 0), 0);
  const totalPaid = filtered.reduce((s, o) => s + (o.advance || 0), 0);
  const totalDue = filtered.reduce((s, o) => s + (o.balance || 0), 0);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Orders
        </Link>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a
                href={`/api/orders/print/pdf?${new URLSearchParams({ dateField, ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <FileDown className="size-4" /> Download PDF
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print / Save PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3 print:hidden">
        <div className="flex gap-1">
          {(["order", "delivery"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setDateField(v)}
              className={cn(
                "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
                dateField === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {v === "order" ? "Order Date" : "Delivery Date"}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-bold text-muted-foreground">From</Label>
          <DatePicker className="w-36" value={from} onChange={setFrom} />
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-bold text-muted-foreground">To</Label>
          <DatePicker className="w-36" value={to} onChange={setTo} />
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
              <img src={shop.logoDataUrl} alt={shop.name || "Company logo"} className="size-12 rounded-lg border bg-white object-contain" />
            ) : (
              <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Scissors className="size-5" />
              </div>
            )}
            <div>
              <p className="font-semibold">{shop?.name || "Company"}</p>
              {shop?.phone && <p className="text-xs text-muted-foreground">{shop.phone}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tracking-tight">Orders List</p>
            <p className="text-xs text-muted-foreground">
              By {dateField} date: {from ? fmtDate(from) : "Start"} to {to ? fmtDate(to) : "Today"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border">
          <div className="bg-card p-3 text-center">
            <p className="text-base font-semibold tabular-nums">{inr(totalBilled)}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Billed</p>
          </div>
          <div className="bg-card p-3 text-center">
            <p className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{inr(totalPaid)}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Paid</p>
          </div>
          <div className="bg-card p-3 text-center">
            <p className={cn("text-base font-semibold tabular-nums", totalDue > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>{inr(totalDue)}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance Due</p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10">
            <EmptyState title="No orders in this range" />
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-2 sm:hidden print:hidden">
              {filtered.map((o) => (
                <div key={o.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">
                        {o.id}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{o.name}</p>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium", o.balance > 0 ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
                      {o.balance > 0 ? "Due" : "Paid"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 border-t pt-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Date</p>
                      <p className="tabular-nums">{fmtDate(dateField === "delivery" ? o.deliveryDate : o.inDate)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total</p>
                      <p className="tabular-nums">{inr(o.total)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Paid</p>
                      <p className="tabular-nums text-emerald-600 dark:text-emerald-400">{o.advance > 0 ? inr(o.advance) : "—"}</p>
                    </div>
                  </div>
                  <p className={cn("mt-1.5 text-right text-sm font-medium tabular-nums", o.balance > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>Balance: {inr(o.balance)}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 hidden overflow-x-auto sm:block print:block">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-bold">Order #</th>
                    <th className="py-2 pr-2 font-bold">Customer</th>
                    <th className="py-2 pr-2 font-bold">{dateField === "delivery" ? "Delivery" : "Order"} Date</th>
                    <th className="py-2 pr-2 text-right font-bold">Total</th>
                    <th className="py-2 pr-2 text-right font-bold">Paid</th>
                    <th className="py-2 pr-2 text-right font-bold">Balance</th>
                    <th className="py-2 text-right font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        <Link href={`/orders/${o.id}`} className="text-primary hover:underline print:text-foreground print:no-underline">
                          {o.id}
                        </Link>
                      </td>
                      <td className="max-w-40 truncate py-2 pr-2">{o.name}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(dateField === "delivery" ? o.deliveryDate : o.inDate)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{inr(o.total)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{o.advance > 0 ? inr(o.advance) : "—"}</td>
                      <td className={cn("py-2 pr-2 text-right font-medium tabular-nums", o.balance > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{inr(o.balance)}</td>
                      <td className="py-2 text-right">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", o.balance > 0 ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
                          {o.balance > 0 ? "Due" : "Paid"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
