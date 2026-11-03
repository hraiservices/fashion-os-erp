"use client";

import { useMemo } from "react";
import Link from "next/link";
import { User, ExternalLink } from "lucide-react";
import { useCustomerByMobile } from "@/hooks/use-customer";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { sumOrdersOutstanding, sumInvoicesOutstanding } from "@/lib/balances";
import { inr, fmtDateShort } from "@/lib/format";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Quick-peek side panel for a customer already picked in a form (New Order, New Invoice,
 * New Quotation, etc.) — balance and recent history without leaving (and losing) the form.
 * Reuses the already-cached useOrders()/useSalesInvoices() shop-wide lists (visited on most
 * pages before a form is ever opened), not a dedicated per-customer fetch.
 */
export function CustomerQuickPeek({ mobile, open, onOpenChange }: { mobile: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: customer, isLoading: customerLoading } = useCustomerByMobile(mobile);
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: invoices, isLoading: invoicesLoading } = useSalesInvoices();

  const custOrders = useMemo(() => (orders || []).filter((o) => o.mobile === mobile).sort((a, b) => new Date(b.inDate).getTime() - new Date(a.inDate).getTime()), [orders, mobile]);
  const custInvoices = useMemo(() => (invoices || []).filter((i) => i.customerMobile === mobile).sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()), [invoices, mobile]);

  const stitchDue = sumOrdersOutstanding(custOrders);
  const salesDue = sumInvoicesOutstanding(custInvoices);
  const outstanding = stitchDue + salesDue;
  const isLoading = customerLoading || ordersLoading || invoicesLoading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" /> Customer details
          </SheetTitle>
        </SheetHeader>

        {isLoading || !customer ? (
          <div className="space-y-3 px-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div>
              <p className="text-base font-semibold">{customer.name}</p>
              <p className="text-sm text-muted-foreground">{customer.mobile}</p>
              {customer.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {customer.tags.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Outstanding balance</p>
              <p className={outstanding > 0 ? "text-lg font-bold tabular-nums text-red-600 dark:text-red-400" : "text-lg font-bold tabular-nums"}>{inr(outstanding)}</p>
              {outstanding > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Stitch {inr(stitchDue)} · Sales {inr(salesDue)}
                </p>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent orders ({custOrders.length})</p>
              {custOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stitching orders yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {custOrders.slice(0, 5).map((o) => (
                    <li key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="truncate">{o.id}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtDateShort(o.inDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent invoices ({custInvoices.length})</p>
              {custInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales invoices yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {custInvoices.slice(0, 5).map((i) => (
                    <li key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="truncate">{i.invoiceNumber}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{inr(i.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <SheetFooter className="border-t">
          <Button variant="outline" nativeButton={false} render={<Link href={`/crm/${mobile}`} target="_blank" />}>
            <ExternalLink className="size-4" /> Open full profile
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
