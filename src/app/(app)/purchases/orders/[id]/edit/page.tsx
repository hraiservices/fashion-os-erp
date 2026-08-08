"use client";

import { use } from "react";
import Link from "next/link";
import { usePurchaseOrder } from "@/hooks/use-purchase-orders";
import { PurchaseOrderForm } from "@/components/purchases/purchase-order-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, FileText } from "lucide-react";

export default function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: po, isLoading } = usePurchaseOrder(id);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/purchases/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Purchase orders
      </Link>
      <h1 className="text-xl font-semibold">Edit purchase order</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !po ? <EmptyState icon={FileText} title="Purchase order not found" /> : <PurchaseOrderForm existing={po} />}
    </div>
  );
}
