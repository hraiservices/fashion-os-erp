"use client";

import { use } from "react";
import Link from "next/link";
import { useSalesQuotation } from "@/hooks/use-sales-quotations";
import { QuotationForm } from "@/components/sales/quotation-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, FileText } from "lucide-react";

export default function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: quote, isLoading } = useSalesQuotation(id);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/sales/quotations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Quotations
      </Link>
      <h1 className="text-xl font-semibold">Edit quotation</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !quote ? <EmptyState icon={FileText} title="Quotation not found" /> : <QuotationForm existing={quote} />}
    </div>
  );
}
