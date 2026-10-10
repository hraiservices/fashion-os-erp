"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, ListTodo, Target, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { useTargetsMeta } from "@/hooks/use-targets";
import { TasksTab } from "@/components/targets/tasks-tab";
import { ProjectsTab } from "@/components/targets/projects-tab";
import { LeadsTab } from "@/components/targets/leads-tab";
import { TargetsTab } from "@/components/targets/targets-tab";
import { TargetsNoAccess } from "@/components/targets/no-access";

type Tab = "tasks" | "projects" | "leads" | "targets";

function TargetsHome() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "leads" || raw === "targets" || raw === "projects" ? raw : "tasks";
  const metaQuery = useTargetsMeta();
  const meta = metaQuery.data;

  // Older links and the "+" menus used ?new=task / ?new=lead; those screens are pages now.
  const wantNew = params.get("new");
  useEffect(() => {
    if (wantNew === "task") router.replace("/targets/tasks/new");
    else if (wantNew === "lead") router.replace("/targets/leads/new");
  }, [wantNew, router]);

  if (metaQuery.isError) return <TargetsNoAccess message={metaQuery.error.message} />;

  const setTab = (t: Tab) => router.replace(t === "tasks" ? "/targets" : `/targets?tab=${t}`, { scroll: false });

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 space-y-4">
      <PageHeader title="Sales Targets" description="Tasks, projects, leads and your goals" />
      <SegmentedToggle<Tab>
        ariaLabel="Targets section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "tasks", label: "Tasks", icon: ListTodo },
          { value: "projects", label: "Projects", icon: FolderKanban },
          { value: "leads", label: "Leads", icon: Users },
          { value: "targets", label: "Targets", icon: Target },
        ]}
      />

      {tab === "tasks" && <TasksTab meta={meta} />}
      {tab === "projects" && <ProjectsTab meta={meta} />}
      {tab === "leads" && <LeadsTab meta={meta} />}
      {tab === "targets" && <TargetsTab meta={meta} />}
    </div>
  );
}

export default function TargetsPage() {
  return (
    <Suspense>
      <TargetsHome />
    </Suspense>
  );
}
