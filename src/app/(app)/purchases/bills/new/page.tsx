"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { BillForm } from "@/components/purchases/bill-form";

function NewBillContent() {
  const searchParams = useSearchParams();
  const poId = searchParams.get("poId") || undefined;
  return <BillForm prefillPoId={poId} />;
}

export default function NewBillPage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <NewBillContent />
    </Suspense>
  );
}
