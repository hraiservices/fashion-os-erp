"use client";

import { use } from "react";
import Link from "next/link";
import { useSalesInvoice } from "@/hooks/use-sales-invoices";
import { InvoiceForm } from "@/components/sales/invoice-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, Receipt } from "lucide-react";

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: invoice, isLoading } = useSalesInvoice(id);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/sales/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Invoices
      </Link>
      <h1 className="text-xl font-semibold">Edit invoice</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !invoice ? <EmptyState icon={Receipt} title="Invoice not found" /> : <InvoiceForm existing={invoice} />}
    </div>
  );
}
