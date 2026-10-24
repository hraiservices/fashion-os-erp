"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, CalendarDays, FolderKanban, ListTodo, Target, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { useLeads, useProjects, useTargetsMeta, useTargetsSummary } from "@/hooks/use-targets";
import { todayBuckets } from "@/lib/lead-insights";
import { TodayTab } from "@/components/targets/today-tab";
import { TasksTab } from "@/components/targets/tasks-tab";
import { ProjectsTab } from "@/components/targets/projects-tab";
import { LeadsTab } from "@/components/targets/leads-tab";
import { TargetsTab } from "@/components/targets/targets-tab";
import { PlannerTab } from "@/components/targets/planner-tab";
import { TargetsNoAccess } from "@/components/targets/no-access";

type Tab = "today" | "tasks" | "projects" | "leads" | "targets" | "planner";

function TargetsHome() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  // "Today" (who to contact) is the landing tab; a shared task link (?task=…) goes straight to Tasks.
  const tab: Tab = raw === "tasks" || raw === "leads" || raw === "targets" || raw === "projects" || raw === "planner" ? raw : params.get("task") ? "tasks" : "today";
  const metaQuery = useTargetsMeta();
  const meta = metaQuery.data;
  // Counts for the tab badges; both are cached queries the tabs use anyway, and the badges just stay off until they arrive.
  const summary = useTargetsSummary({ quiet: true }).data;
  const projects = useProjects().data;
  const activeProjects = projects?.filter((p) => p.status === "active").length;
  // The same cached query the Today tab reads; its groups are what the badge counts.
  const openLeads = useLeads({ stage: "open", limit: 1000 }).data?.leads;
  const buckets = openLeads && meta ? todayBuckets(openLeads, meta.today) : null;
  const todayCount = buckets ? buckets.due.length + buckets.quiet.length + buckets.hot.length : undefined;

  // Older links and the "+" menus used ?new=task / ?new=lead; those screens are pages now.
  const wantNew = params.get("new");
  useEffect(() => {
    if (wantNew === "task") router.replace("/targets/tasks/new");
    else if (wantNew === "lead") router.replace("/targets/leads/new");
    // A direct ?tab=planner link for someone without the permission (rather than someone who just
    // had it taken away mid-session) — the API would 403 anyway, but there's no reason to let the
    // tab render at all once the permission is known.
    else if (tab === "planner" && meta && !meta.can.usePlanner) router.replace("/targets");
  }, [wantNew, tab, meta, router]);

  if (metaQuery.isError) return <TargetsNoAccess message={metaQuery.error.message} />;

  const setTab = (t: Tab) => router.replace(t === "today" ? "/targets" : `/targets?tab=${t}`, { scroll: false });

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 space-y-4">
      <PageHeader title="Sales Targets" description="Tasks, projects, leads and your goals" />
      <SegmentedToggle<Tab>
        ariaLabel="Targets section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "today", label: "Today", icon: CalendarCheck, tone: "rose", count: todayCount },
          { value: "tasks", label: "Tasks", icon: ListTodo, tone: "blue", count: summary?.openTaskCount },
          { value: "projects", label: "Projects", icon: FolderKanban, tone: "amber", count: activeProjects },
          { value: "leads", label: "Leads", icon: Users, tone: "green", count: summary?.openLeads },
          { value: "targets", label: "Targets", icon: Target, tone: "purple", count: summary?.targets.length },
          ...(meta?.can.usePlanner ? [{ value: "planner" as const, label: "Planner", icon: CalendarDays, tone: "teal" as const }] : []),
        ]}
      />

      {tab === "today" && <TodayTab meta={meta} />}
      {tab === "tasks" && <TasksTab meta={meta} />}
      {tab === "projects" && <ProjectsTab meta={meta} />}
      {tab === "leads" && <LeadsTab meta={meta} />}
      {tab === "targets" && <TargetsTab meta={meta} />}
      {tab === "planner" && meta?.can.usePlanner && <PlannerTab meta={meta} />}
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
