"use client";

import { useOrders } from "@/hooks/use-orders";
import { OrderStatusCards } from "@/components/orders/order-status-cards";
import { Skeleton } from "@/components/ui/skeleton";

/** Dashboard-tile version of the small clickable count cards atop the Orders list — same
 *  component, same counts, so the two never drift apart. */
export function OrderStatusCardsWidget() {
  const { data: orders, isLoading } = useOrders();

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold">Order Pipeline</h2>
      <OrderStatusCards orders={orders || []} />
    </section>
  );
}
