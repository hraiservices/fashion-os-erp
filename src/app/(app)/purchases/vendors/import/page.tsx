"use client";

import { VendorImportWizard } from "@/components/purchases/vendor-import-wizard";
import { BackLink } from "@/components/ui/back-link";

export default function ImportVendorsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <BackLink href="/purchases/vendors">Vendors</BackLink>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import vendors</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one vendor.</p>
      </div>
      <VendorImportWizard />
    </div>
  );
}
