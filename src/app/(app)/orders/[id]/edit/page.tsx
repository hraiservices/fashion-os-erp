"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useOrder } from "@/hooks/use-order";
import { OrderForm } from "@/components/orders/order-form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: order, isLoading } = useOrder(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!order) {
    return (
      <div className="p-6">
        <EmptyState icon={ArrowLeft} title="Order not found" action={<Button nativeButton={false} render={<Link href="/orders" />}>Back to orders</Button>} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href={`/orders/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to order
      </Link>
      <PageHeader title="Edit order" description={`${order.id} · ${order.name}`} />
      <OrderForm existingOrder={order} />
    </div>
  );
}
