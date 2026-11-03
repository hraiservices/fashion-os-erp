"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Truck, ExternalLink } from "lucide-react";
import { useVendors } from "@/hooks/use-vendors";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { inr, fmtDateShort } from "@/lib/format";
import { PO_STATUS_LABELS } from "@/lib/purchases";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Quick-peek side panel for a vendor already picked in a form (New Bill, New PO, etc.) — payable
 * balance and recent history without leaving the form. Mirrors CustomerQuickPeek; reuses the
 * already-cached shop-wide vendors/bills/POs lists rather than a dedicated per-vendor fetch.
 */
export function VendorQuickPeek({ vendorId, open, onOpenChange }: { vendorId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: vendors, isLoading: vendorsLoading } = useVendors();
  const { data: bills, isLoading: billsLoading } = usePurchaseBills();
  const { data: orders, isLoading: ordersLoading } = usePurchaseOrders();

  const vendor = (vendors || []).find((v) => v.id === vendorId);
  const vendorBills = useMemo(() => (bills || []).filter((b) => b.vendorId === vendorId).sort((a, b) => new Date(b.billDate).getTime() - new Date(a.billDate).getTime()), [bills, vendorId]);
  const vendorOrders = useMemo(() => (orders || []).filter((o) => o.vendorId === vendorId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [orders, vendorId]);

  const payable = vendorBills.reduce((s, b) => s + (b.balance || 0), 0);
  const isLoading = vendorsLoading || billsLoading || ordersLoading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Truck className="size-4 text-muted-foreground" /> Vendor details
          </SheetTitle>
        </SheetHeader>

        {isLoading || !vendor ? (
          <div className="space-y-3 px-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div>
              <p className="text-base font-semibold">{vendor.name}</p>
              <p className="text-sm text-muted-foreground">{[vendor.mobile, vendor.gstin].filter(Boolean).join(" · ") || "—"}</p>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Payable balance</p>
              <p className={payable > 0 ? "text-lg font-bold tabular-nums text-red-600 dark:text-red-400" : "text-lg font-bold tabular-nums"}>{inr(payable)}</p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent bills ({vendorBills.length})</p>
              {vendorBills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bills yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {vendorBills.slice(0, 5).map((b) => (
                    <li key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="truncate">{b.billNumber}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{inr(b.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent purchase orders ({vendorOrders.length})</p>
              {vendorOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {vendorOrders.slice(0, 5).map((o) => (
                    <li key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="truncate">{o.poNumber}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="outline">{PO_STATUS_LABELS[o.status]}</Badge>
                        {fmtDateShort(o.date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <SheetFooter className="border-t">
          <Button variant="outline" nativeButton={false} render={<Link href={`/purchases/vendors/${vendorId}`} target="_blank" />}>
            <ExternalLink className="size-4" /> Open full profile
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
