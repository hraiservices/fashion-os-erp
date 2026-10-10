"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useTargetsMeta } from "@/hooks/use-targets";
import { TaskForm } from "@/components/targets/task-form";

/** Only ever send people back to a Targets screen — the `from` link comes from the address bar. */
function safeBack(from: string | null): string {
  return from && from.startsWith("/targets") && !from.startsWith("//") ? from : "/targets";
}

function NewTask() {
  const params = useSearchParams();
  const meta = useTargetsMeta().data;
  if (!meta) return <Skeleton className="m-4 h-64 sm:m-6" />;
  return (
    <TaskForm
      meta={meta}
      backHref={safeBack(params.get("from"))}
      defaults={{
        title: params.get("title") ?? undefined,
        projectId: params.get("projectId"),
        taskListId: params.get("taskListId"),
        linkType: params.get("linkType"),
        linkId: params.get("linkId"),
        linkLabel: params.get("linkLabel"),
      }}
    />
  );
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <NewTask />
    </Suspense>
  );
}
