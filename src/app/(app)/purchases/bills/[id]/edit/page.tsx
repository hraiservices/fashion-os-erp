"use client";

import { use } from "react";
import { ReceiptDuotoneIcon } from "@/components/icons/duotone-icons";

import { usePurchaseBill } from "@/hooks/use-purchase-bills";
import { BillForm } from "@/components/purchases/bill-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: bill, isLoading } = usePurchaseBill(id);

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!bill) return <EmptyState icon={ReceiptDuotoneIcon} title="Bill not found" />;
  return <BillForm existing={bill} />;
}
