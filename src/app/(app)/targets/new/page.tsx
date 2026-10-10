"use client";

import { PageHeader } from "@/components/ui/page-header";
import { useTargetsMeta } from "@/hooks/use-targets";
import { TargetForm } from "@/components/targets/target-form";

export default function NewTargetPage() {
  const meta = useTargetsMeta().data;
  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 space-y-5">
      <PageHeader title="New target" description="Progress counts itself from real orders and invoices." />
      {meta && !meta.can.manageTargets ? <p className="text-sm text-muted-foreground">You do not have permission to create targets.</p> : <TargetForm meta={meta} />}
    </div>
  );
}
