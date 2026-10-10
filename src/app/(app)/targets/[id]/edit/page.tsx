"use client";

import { use } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTarget, useTargetsMeta } from "@/hooks/use-targets";
import { TargetForm } from "@/components/targets/target-form";

export default function EditTargetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const meta = useTargetsMeta().data;
  const { data: target, isLoading } = useTarget(id);
  if (isLoading || !meta) return <Skeleton className="m-4 h-64 sm:m-6" />;
  if (!target) return <p className="p-4 text-sm text-muted-foreground sm:p-6">Target not found.</p>;
  return <TargetForm meta={meta} target={target} />;
}
