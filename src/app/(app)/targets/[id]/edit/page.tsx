"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useTarget, useTargetsMeta } from "@/hooks/use-targets";
import { TargetForm } from "@/components/targets/target-form";

export default function EditTargetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const meta = useTargetsMeta().data;
  const { data: target, isLoading } = useTarget(id);
  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 space-y-5">
      <PageHeader title="Edit target" />
      {isLoading || !meta ? <Skeleton className="h-64 w-full" /> : !target ? <p className="text-sm text-muted-foreground">Target not found.</p> : <TargetForm meta={meta} target={target} />}
    </div>
  );
}
