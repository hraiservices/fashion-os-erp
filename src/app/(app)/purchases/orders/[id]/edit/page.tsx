"use client";

import { use } from "react";
import { FileText } from "lucide-react";
import { usePurchaseOrder } from "@/hooks/use-purchase-orders";
import { PurchaseOrderForm } from "@/components/purchases/purchase-order-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: po, isLoading } = usePurchaseOrder(id);

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!po) return <EmptyState icon={FileText} title="Purchase order not found" />;
  return <PurchaseOrderForm existing={po} />;
}
