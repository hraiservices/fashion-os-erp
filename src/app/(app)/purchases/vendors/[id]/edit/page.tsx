"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Truck } from "lucide-react";
import { useVendor } from "@/hooks/use-vendors";
import { VendorForm } from "@/components/purchases/vendor-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: vendor, isLoading } = useVendor(id);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href={`/purchases/vendors/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to vendor
      </Link>
      <h1 className="text-xl font-semibold">Edit vendor</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !vendor ? <EmptyState icon={Truck} title="Vendor not found" /> : <VendorForm existing={vendor} />}
    </div>
  );
}
