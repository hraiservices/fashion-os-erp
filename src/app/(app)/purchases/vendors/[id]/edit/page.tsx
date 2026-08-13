"use client";

import { use } from "react";
import { Truck } from "lucide-react";
import { useVendor } from "@/hooks/use-vendors";
import { VendorForm } from "@/components/purchases/vendor-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: vendor, isLoading } = useVendor(id);

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!vendor) return <EmptyState icon={Truck} title="Vendor not found" />;
  return <VendorForm existing={vendor} />;
}
