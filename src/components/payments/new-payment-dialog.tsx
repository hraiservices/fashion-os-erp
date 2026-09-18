"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, CreditCard, Receipt, Scissors, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DueBadge } from "@/components/orders/stage-badge";
import { BalanceDue } from "@/components/ui/money-text";
import { EmptyState } from "@/components/ui/empty-state";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { isOrderOutstanding, sumOrdersOutstanding } from "@/lib/balances";
import { inr, fmtDate } from "@/lib/format";
import type { Order } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";

/**
 * Customer-first "record a payment" flow: pick a customer (skipped when opened with a customer
 * already in context, e.g. from their profile page), then choose which of their outstanding
 * items — stitching orders and product-sale invoices are always listed separately, never
 * merged — the payment is for. Picking either closes this dialog and hands off to the matching
 * payment modal (PaymentModal for orders, InvoicePaymentModal for invoices).
 */
export function NewPaymentDialog({
  open,
  onOpenChange,
  selectedMobile,
  onSelectMobile,
  allowCustomerChange,
  onSelectOrder,
  onSelectInvoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedMobile: string | null;
  onSelectMobile: (mobile: string) => void;
  allowCustomerChange: boolean;
  onSelectOrder: (order: Order) => void;
  onSelectInvoice: (invoice: SalesInvoiceWithBalance) => void;
}) {
  const [query, setQuery] = useState("");
  const { profiles } = useCustomerProfiles();
  const { data: allInvoices } = useSalesInvoices();

  const customerResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles
      .map((c) => ({
        mobile: c.mobile,
        name: c.name,
        orderDue: sumOrdersOutstanding(c.orders),
        invoiceDue: (allInvoices || []).filter((i) => i.customerMobile === c.mobile).reduce((s, i) => s + i.balance, 0),
      }))
      .filter((c) => c.orderDue + c.invoiceDue > 0)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q))
      .sort((a, b) => b.orderDue + b.invoiceDue - (a.orderDue + a.invoiceDue));
  }, [profiles, allInvoices, query]);

  const selectedCustomer = selectedMobile ? profiles.find((c) => c.mobile === selectedMobile) : undefined;
  const dueOrders = useMemo(() => (selectedCustomer ? selectedCustomer.orders.filter(isOrderOutstanding).sort((a, b) => b.balance - a.balance) : []), [selectedCustomer]);
  const dueInvoices = useMemo(
    () => (selectedMobile ? (allInvoices || []).filter((i) => i.customerMobile === selectedMobile && i.balance > 0).sort((a, b) => b.balance - a.balance) : []),
    [allInvoices, selectedMobile]
  );

  function reset(v: boolean) {
    if (!v) setQuery("");
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            {selectedMobile && allowCustomerChange && (
              <button type="button" onClick={() => onSelectMobile("")} aria-label="Back to customer search" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-4" />
              </button>
            )}
            <CreditCard className="size-4 text-muted-foreground" />
            {selectedMobile ? `Record payment for ${selectedCustomer?.name || selectedMobile}` : "Select customer to record payment"}
          </DialogTitle>
        </DialogHeader>

        {!selectedMobile ? (
          <>
            <div className="border-b px-4 py-3">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus placeholder="Search by name or mobile…" className="h-9 pl-8 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {customerResults.length === 0 ? (
                <EmptyState icon={CreditCard} title={query ? `No results for "${query}"` : "All payments collected"} description={query ? undefined : "No customer has an outstanding balance."} className="border-0" />
              ) : (
                <ul className="divide-y">
                  {customerResults.map((c) => (
                    <li key={c.mobile}>
                      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50" onClick={() => onSelectMobile(c.mobile)}>
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {c.name.trim().charAt(0).toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.mobile}</p>
                        </div>
                        <BalanceDue amount={c.orderDue + c.invoiceDue} paidLabel={inr(c.orderDue + c.invoiceDue)} className="shrink-0 text-sm font-semibold" />
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="max-h-[500px] space-y-4 overflow-y-auto p-4">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Scissors className="size-3.5" /> Stitching orders due
              </p>
              {dueOrders.length === 0 ? (
                <p className="rounded-lg border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">No stitching orders due.</p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-lg border">
                  {dueOrders.map((o) => (
                    <li key={o.id}>
                      <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50" onClick={() => onSelectOrder(o)}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{o.id}</p>
                          <p className="truncate text-xs text-muted-foreground">{fmtDate(o.deliveryDate)}</p>
                        </div>
                        <DueBadge order={o} />
                        <BalanceDue amount={o.balance} paidLabel={inr(o.balance)} className="shrink-0 text-sm font-semibold" />
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Receipt className="size-3.5" /> Sales invoices due
              </p>
              {dueInvoices.length === 0 ? (
                <p className="rounded-lg border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">No sales invoices due.</p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-lg border">
                  {dueInvoices.map((inv) => (
                    <li key={inv.id}>
                      <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50" onClick={() => onSelectInvoice(inv)}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{inv.invoiceNumber}</p>
                          <p className="truncate text-xs text-muted-foreground">{fmtDate(inv.invoiceDate)}</p>
                        </div>
                        <BalanceDue amount={inv.balance} paidLabel={inr(inv.balance)} className="shrink-0 text-sm font-semibold" />
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
