import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CostSheetForm } from "@/components/cost-estimator/cost-sheet-form";

export default function NewCostSheetPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href="/cost-estimator" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Cost sheets
      </Link>
      <h1 className="text-xl font-semibold">New cost sheet</h1>
      <CostSheetForm />
    </div>
  );
}
