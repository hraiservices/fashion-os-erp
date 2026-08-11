"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomerImportWizard } from "@/components/crm/customer-import-wizard";

export default function ImportCustomersPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/crm" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import customers</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one customer profile.</p>
      </div>
      <CustomerImportWizard />
    </div>
  );
}
