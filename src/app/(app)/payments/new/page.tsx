"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordPaymentForm } from "@/components/payments/record-payment-form";

function NewPaymentContent() {
  const searchParams = useSearchParams();
  const mobile = searchParams.get("customer") || undefined;
  return <RecordPaymentForm initialMobile={mobile} />;
}

export default function NewPaymentPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Wallet className="size-5 text-muted-foreground" /> Record payment
      </h1>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewPaymentContent />
      </Suspense>
    </div>
  );
}
