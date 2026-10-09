"use client";

import { use } from "react";
import { useSalesInvoice } from "@/hooks/use-sales-invoices";
import { InvoiceForm } from "@/components/sales/invoice-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReceiptDuotoneIcon } from "@/components/icons/duotone-icons";
import { BackLink } from "@/components/ui/back-link";

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: invoice, isLoading } = useSalesInvoice(id);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <BackLink href="/sales/invoices">Invoices</BackLink>
      <h1 className="text-xl font-semibold">Edit invoice</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !invoice ? <EmptyState icon={ReceiptDuotoneIcon} title="Invoice not found" /> : <InvoiceForm existing={invoice} />}
    </div>
  );
}
