"use client";

import { use } from "react";
import { useCostSheet } from "@/hooks/use-cost-sheet";
import { CostSheetForm } from "@/components/cost-estimator/cost-sheet-form";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink } from "@/components/ui/back-link";

export default function EditCostSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: sheet, isLoading } = useCostSheet(id);

  if (isLoading)
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <BackLink href="/cost-estimator">Cost sheets</BackLink>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!sheet)
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <BackLink href="/cost-estimator">Cost sheets</BackLink>
        <p className="text-muted-foreground">Cost sheet not found.</p>
      </div>
    );

  return <CostSheetForm existing={sheet} />;
}
