"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { TargetsNoAccess } from "@/components/targets/no-access";
import { useTargetsMeta } from "@/hooks/use-targets";
import { LeadForm } from "@/components/targets/lead-form";

export default function NewLeadPage() {
  const metaQuery = useTargetsMeta();
  const meta = metaQuery.data;
  if (metaQuery.isError) return <TargetsNoAccess message={metaQuery.error.message} />;
  if (!meta) return <Skeleton className="m-4 h-64 sm:m-6" />;
  if (!meta.can.manageLeads) return <p className="p-4 text-sm text-muted-foreground sm:p-6">You do not have permission to add leads.</p>;
  return <LeadForm meta={meta} />;
}
