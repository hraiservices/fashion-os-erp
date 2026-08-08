"use client";

import { use } from "react";
import Link from "next/link";
import { usePurchaseBill } from "@/hooks/use-purchase-bills";
import { BillForm } from "@/components/purchases/bill-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, Receipt } from "lucide-react";

export default function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: bill, isLoading } = usePurchaseBill(id);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/purchases/bills" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Bills
      </Link>
      <h1 className="text-xl font-semibold">Edit bill</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !bill ? <EmptyState icon={Receipt} title="Bill not found" /> : <BillForm existing={bill} />}
    </div>
  );
}
