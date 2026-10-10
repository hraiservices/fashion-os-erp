"use client";

import { use } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject, useTargetsMeta } from "@/hooks/use-targets";
import { ProjectForm } from "@/components/targets/project-form";

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const meta = useTargetsMeta().data;
  const { data, isLoading } = useProject(id);
  if (isLoading || !meta) return <Skeleton className="m-4 h-64 sm:m-6" />;
  if (!data) return <p className="p-4 text-sm text-muted-foreground sm:p-6">Project not found.</p>;
  if (!data.canManage) return <p className="p-4 text-sm text-muted-foreground sm:p-6">You do not have permission to edit this project.</p>;
  return <ProjectForm meta={meta} project={data.project} />;
}
