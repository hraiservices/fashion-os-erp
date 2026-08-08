"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Plus, FileText, ChevronRight } from "lucide-react";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { useVendors } from "@/hooks/use-vendors";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { PO_STATUS_LABELS } from "@/lib/purchases";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function PurchaseOrdersPage() {
  const { data: orders, isLoading } = usePurchaseOrders();
  const { data: vendors } = useVendors();
  const { data: user } = useCurrentUser();
  const canManage = !!user?.perms.managePurchases;

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Purchase Orders"
        description={`${orders?.length ?? 0} purchase orders`}
        actions={
          canManage && (
            <Button nativeButton={false} render={<Link href="/purchases/orders/new" />}>
              <Plus className="size-4" /> New PO
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !orders || orders.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No purchase orders yet"
          description="Create a PO to plan what you're ordering from a vendor before the bill arrives."
          action={
            canManage && (
              <Button nativeButton={false} render={<Link href="/purchases/orders/new" />}>
                <Plus className="size-4" /> New PO
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link key={o.id} href={`/purchases/orders/${o.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{o.poNumber}</span>
                  <Badge variant="outline">{PO_STATUS_LABELS[o.status]}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {vendorNameById.get(o.vendorId) || "Unknown vendor"} · {fmtDate(o.date)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(o.total)}</p>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
