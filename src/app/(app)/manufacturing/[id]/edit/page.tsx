"use client";

import { use } from "react";
import Link from "next/link";
import { useWorkOrder } from "@/hooks/use-work-orders";
import { WorkOrderForm } from "@/components/manufacturing/work-order-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, Factory } from "lucide-react";

export default function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: wo, isLoading } = useWorkOrder(id);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/manufacturing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Work orders
      </Link>
      <h1 className="text-xl font-semibold">Edit work order</h1>
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !wo ? (
        <EmptyState icon={Factory} title="Work order not found" />
      ) : wo.status === "completed" ? (
        <EmptyState icon={Factory} title="This work order is completed" description="Completed work orders are locked — stock has already moved and costs are frozen." />
      ) : (
        <WorkOrderForm existing={wo} />
      )}
    </div>
  );
}
