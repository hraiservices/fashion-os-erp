"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { PurchaseOrderForm } from "@/components/purchases/purchase-order-form";

function NewPurchaseOrderContent() {
  const searchParams = useSearchParams();
  const prefillVendorId = searchParams.get("vendor") || undefined;
  return <PurchaseOrderForm prefillVendorId={prefillVendorId} />;
}

export default function NewPurchaseOrderPage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <NewPurchaseOrderContent />
    </Suspense>
  );
}
