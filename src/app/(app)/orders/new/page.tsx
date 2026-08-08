"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { OrderForm } from "@/components/orders/order-form";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

function NewOrderContent() {
  const searchParams = useSearchParams();
  const mobile = searchParams.get("mobile") ?? undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Orders
      </Link>
      <PageHeader title="New order" description="Add a stitching order for a customer" />
      <OrderForm prefillMobile={mobile} />
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>}>
      <NewOrderContent />
    </Suspense>
  );
}
