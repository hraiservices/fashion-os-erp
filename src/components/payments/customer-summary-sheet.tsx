"use client";

import Link from "next/link";
import { ArrowRight, Mail, MapPin, Phone, Wallet } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useCustomerCredit } from "@/hooks/use-customer-credit";
import { sumOrdersOutstanding } from "@/lib/balances";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { inr } from "@/lib/format";

/** Slide-over quick-look at a customer, opened from clicking their name on the Record Payment
 *  page — a summary in place, not a navigation away from the payment being entered (which would
 *  lose the form's state). "View full profile" is the deliberate escape hatch to the real page. */
export function CustomerSummarySheet({ mobile, open, onOpenChange }: { mobile: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { profiles } = useCustomerProfiles();
  const { data: allInvoices } = useSalesInvoices();
  const { data: creditBalance } = useCustomerCredit(mobile);

  const customer = profiles.find((c) => c.mobile === mobile);
  const orderDue = customer ? sumOrdersOutstanding(customer.orders) : 0;
  const invoiceDue = (allInvoices || []).filter((i) => i.customerMobile === mobile).reduce((s, i) => s + i.balance, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Customer</SheetTitle>
        </SheetHeader>
        {customer && (
          <div className="flex-1 space-y-4 overflow-y-auto px-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {customer.name.trim().charAt(0).toUpperCase() || "?"}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{customer.name}</p>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Phone className="size-3.5" /> {customer.mobile}
                </p>
              </div>
            </div>

            {(customer.email || customer.address) && (
              <div className="space-y-1.5 text-sm">
                {customer.email && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="size-3.5 shrink-0" /> {customer.email}
                  </p>
                )}
                {customer.address && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" /> {customer.address}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-red-500/5 p-3">
                <p className="text-[10px] font-medium tracking-wide text-red-600/80 uppercase dark:text-red-400/80">Outstanding</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums">{inr(orderDue + invoiceDue)}</p>
              </div>
              <div className="rounded-lg border bg-emerald-500/5 p-3">
                <p className="flex items-center gap-1 text-[10px] font-medium tracking-wide text-emerald-600/80 uppercase dark:text-emerald-400/80">
                  <Wallet className="size-3" /> Credit balance
                </p>
                <p className="mt-0.5 text-base font-semibold tabular-nums">{inr(creditBalance || 0)}</p>
              </div>
            </div>

            <Button variant="outline" className="w-full" nativeButton={false} render={<Link href={`/crm/${customer.mobile}`} />}>
              View full profile <ArrowRight className="size-3.5" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
