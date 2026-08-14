"use client";

import { use } from "react";
import { ArrowLeft } from "lucide-react";
import { useOrder } from "@/hooks/use-order";
import { OrderForm } from "@/components/orders/order-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: order, isLoading } = useOrder(id);

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!order) return <EmptyState icon={ArrowLeft} title="Order not found" />;
  return <OrderForm existingOrder={order} />;
}
