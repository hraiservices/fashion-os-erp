"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvoiceImportWizard } from "@/components/sales/invoice-import-wizard";

export default function ImportInvoicesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/sales/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Invoices
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import invoices</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one draft invoice with a single line item — stock deducts the same way as a manually created invoice.</p>
      </div>
      <InvoiceImportWizard />
    </div>
  );
}
