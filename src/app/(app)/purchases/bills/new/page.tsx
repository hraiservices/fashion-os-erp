"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BillForm } from "@/components/purchases/bill-form";

function NewBillContent() {
  const searchParams = useSearchParams();
  const poId = searchParams.get("poId") || undefined;
  return <BillForm prefillPoId={poId} />;
}

export default function NewBillPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/purchases/bills" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Bills
      </Link>
      <h1 className="text-xl font-semibold">New bill</h1>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewBillContent />
      </Suspense>
    </div>
  );
}
