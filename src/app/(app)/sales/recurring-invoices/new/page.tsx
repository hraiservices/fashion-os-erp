"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RecurringInvoiceForm } from "@/components/sales/recurring-invoice-form";

export default function NewRecurringInvoicePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/sales/recurring-invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Recurring invoices
      </Link>
      <h1 className="text-xl font-semibold">New recurring invoice profile</h1>
      <RecurringInvoiceForm />
    </div>
  );
}
