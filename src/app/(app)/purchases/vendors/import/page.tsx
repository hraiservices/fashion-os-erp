"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VendorImportWizard } from "@/components/purchases/vendor-import-wizard";

export default function ImportVendorsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/purchases/vendors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Vendors
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import vendors</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one vendor.</p>
      </div>
      <VendorImportWizard />
    </div>
  );
}
