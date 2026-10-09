"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceForm } from "@/components/sales/invoice-form";
import { BackLink } from "@/components/ui/back-link";

function NewInvoiceContent() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("quoteId") || undefined;
  const cloneId = searchParams.get("cloneId") || undefined;
  const mobile = searchParams.get("mobile") || undefined;
  return <InvoiceForm prefillQuoteId={quoteId} prefillCloneId={cloneId} prefillMobile={mobile} />;
}

export default function NewInvoicePage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <BackLink href="/sales/invoices">Invoices</BackLink>
      <h1 className="text-xl font-semibold">New invoice</h1>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewInvoiceContent />
      </Suspense>
    </div>
  );
}
