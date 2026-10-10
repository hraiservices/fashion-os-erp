"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useTargetsMeta } from "@/hooks/use-targets";
import { TargetForm } from "@/components/targets/target-form";

export default function NewTargetPage() {
  const meta = useTargetsMeta().data;
  if (!meta) return <Skeleton className="m-4 h-64 sm:m-6" />;
  if (!meta.can.manageTargets) return <p className="p-4 text-sm text-muted-foreground sm:p-6">You do not have permission to create targets.</p>;
  return <TargetForm meta={meta} />;
}
