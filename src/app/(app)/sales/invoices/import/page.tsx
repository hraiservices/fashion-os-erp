"use client";

import { InvoiceImportWizard } from "@/components/sales/invoice-import-wizard";
import { BackLink } from "@/components/ui/back-link";

export default function ImportInvoicesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <BackLink href="/sales/invoices">Invoices</BackLink>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import invoices</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one draft invoice with a single line item — stock deducts the same way as a manually created invoice.</p>
      </div>
      <InvoiceImportWizard />
    </div>
  );
}
