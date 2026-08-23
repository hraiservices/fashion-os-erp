"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceForm } from "@/components/sales/invoice-form";

function NewInvoiceContent() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("quoteId") || undefined;
  const cloneId = searchParams.get("cloneId") || undefined;
  const mobile = searchParams.get("mobile") || undefined;
  return <InvoiceForm prefillQuoteId={quoteId} prefillCloneId={cloneId} prefillMobile={mobile} />;
}

export default function NewInvoicePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/sales/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Invoices
      </Link>
      <h1 className="text-xl font-semibold">New invoice</h1>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewInvoiceContent />
      </Suspense>
    </div>
  );
}
