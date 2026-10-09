"use client";

import { RecurringInvoiceForm } from "@/components/sales/recurring-invoice-form";
import { BackLink } from "@/components/ui/back-link";

export default function NewRecurringInvoicePage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <BackLink href="/sales/recurring-invoices">Recurring invoices</BackLink>
      <h1 className="text-xl font-semibold">New recurring invoice profile</h1>
      <RecurringInvoiceForm />
    </div>
  );
}
