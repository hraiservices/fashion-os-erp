"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OrderForm } from "@/components/orders/order-form";
import { Skeleton } from "@/components/ui/skeleton";

function NewOrderContent() {
  const searchParams = useSearchParams();
  const mobile = searchParams.get("mobile") ?? undefined;
  const isAlteration = searchParams.get("type") === "alteration";

  return <OrderForm prefillMobile={mobile} initialOrderType={isAlteration ? "alteration" : "new"} />;
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <NewOrderContent />
    </Suspense>
  );
}
