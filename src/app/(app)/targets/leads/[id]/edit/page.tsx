"use client";

import { use } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLead, useTargetsMeta } from "@/hooks/use-targets";
import { LeadForm } from "@/components/targets/lead-form";

export default function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const meta = useTargetsMeta().data;
  const { data, isLoading } = useLead(id);
  if (isLoading || !meta) return <Skeleton className="m-4 h-64 sm:m-6" />;
  if (!data) return <p className="p-4 text-sm text-muted-foreground sm:p-6">Lead not found.</p>;
  if (!meta.can.manageLeads) return <p className="p-4 text-sm text-muted-foreground sm:p-6">You do not have permission to edit leads.</p>;
  return <LeadForm meta={meta} lead={data.lead} />;
}
