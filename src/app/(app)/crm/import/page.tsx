"use client";

import { CustomerImportWizard } from "@/components/crm/customer-import-wizard";
import { BackLink } from "@/components/ui/back-link";

export default function ImportCustomersPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <BackLink href="/crm">Customers</BackLink>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import customers</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one customer profile.</p>
      </div>
      <CustomerImportWizard />
    </div>
  );
}
