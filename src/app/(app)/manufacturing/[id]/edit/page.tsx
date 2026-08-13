"use client";

import { use } from "react";
import { Factory } from "lucide-react";
import { useWorkOrder } from "@/hooks/use-work-orders";
import { WorkOrderForm } from "@/components/manufacturing/work-order-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: wo, isLoading } = useWorkOrder(id);

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!wo) return <EmptyState icon={Factory} title="Work order not found" />;
  if (wo.status === "completed") return (
    <EmptyState icon={Factory} title="This work order is completed" description="Completed work orders are locked — stock has already moved and costs are frozen." />
  );
  return <WorkOrderForm existing={wo} />;
}
