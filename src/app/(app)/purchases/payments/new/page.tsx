"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { VendorPaymentForm } from "@/components/purchases/vendor-payment-form";
import { BackLink } from "@/components/ui/back-link";

function NewVendorPaymentContent() {
  const searchParams = useSearchParams();
  const vendor = searchParams.get("vendor") || undefined;
  return <VendorPaymentForm initialVendorId={vendor} />;
}

export default function NewVendorPaymentPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <BackLink href="/purchases/payments">Payments Made</BackLink>
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Wallet className="size-5 text-muted-foreground" /> Record vendor payment
      </h1>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewVendorPaymentContent />
      </Suspense>
    </div>
  );
}
