"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCostSheet } from "@/hooks/use-cost-sheet";
import { CostSheetForm } from "@/components/cost-estimator/cost-sheet-form";
import { Skeleton } from "@/components/ui/skeleton";

const BackLink = () => (
  <Link href="/cost-estimator" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
    <ArrowLeft className="size-4" /> Cost sheets
  </Link>
);

export default function EditCostSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: sheet, isLoading } = useCostSheet(id);

  if (isLoading)
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <BackLink />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!sheet)
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <BackLink />
        <p className="text-muted-foreground">Cost sheet not found.</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <BackLink />
      <h1 className="text-xl font-semibold">Edit {sheet.cost_sheet_no}</h1>
      <CostSheetForm existing={sheet} />
    </div>
  );
}
