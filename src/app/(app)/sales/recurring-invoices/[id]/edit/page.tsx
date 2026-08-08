"use client";

import { use } from "react";
import Link from "next/link";
import { useRecurringInvoiceProfile } from "@/hooks/use-recurring-invoices";
import { RecurringInvoiceForm } from "@/components/sales/recurring-invoice-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, Repeat } from "lucide-react";

export default function EditRecurringInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: profile, isLoading } = useRecurringInvoiceProfile(id);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/sales/recurring-invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Recurring invoices
      </Link>
      <h1 className="text-xl font-semibold">Edit recurring invoice profile</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !profile ? <EmptyState icon={Repeat} title="Profile not found" /> : <RecurringInvoiceForm existing={profile} />}
    </div>
  );
}
