"use client";

import { use } from "react";
import { useRecurringInvoiceProfile } from "@/hooks/use-recurring-invoices";
import { RecurringInvoiceForm } from "@/components/sales/recurring-invoice-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Repeat } from "lucide-react";
import { BackLink } from "@/components/ui/back-link";

export default function EditRecurringInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: profile, isLoading } = useRecurringInvoiceProfile(id);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <BackLink href="/sales/recurring-invoices">Recurring invoices</BackLink>
      <h1 className="text-xl font-semibold">Edit recurring invoice profile</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !profile ? <EmptyState icon={Repeat} title="Profile not found" /> : <RecurringInvoiceForm existing={profile} />}
    </div>
  );
}
