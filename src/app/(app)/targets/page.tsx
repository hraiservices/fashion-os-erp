"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, ListTodo, Plus, Target, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTargetsMeta } from "@/hooks/use-targets";
import { TasksTab } from "@/components/targets/tasks-tab";
import { ProjectsTab } from "@/components/targets/projects-tab";
import { LeadsTab } from "@/components/targets/leads-tab";
import { TargetsTab } from "@/components/targets/targets-tab";

type Tab = "tasks" | "projects" | "leads" | "targets";

function TargetsHome() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "leads" || raw === "targets" || raw === "projects" ? raw : "tasks";
  const meta = useTargetsMeta().data;
  const [taskOpen, setTaskOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);

  // "+" menus elsewhere in the app deep-link here with ?new=task / ?new=lead.
  const wantNew = params.get("new");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the requested sheet once, then clear the query
    if (wantNew === "task") setTaskOpen(true);
    if (wantNew === "lead") setLeadOpen(true);
    if (wantNew) router.replace(tab === "tasks" ? "/targets" : `/targets?tab=${tab}`, { scroll: false });
  }, [wantNew, tab, router]);

  const setTab = (t: Tab) => router.replace(t === "tasks" ? "/targets" : `/targets?tab=${t}`, { scroll: false });
  const canAddLead = !!meta?.can.manageLeads;

  function plus() {
    if (tab === "leads" && canAddLead) return setLeadOpen(true);
    if (tab === "tasks" && !canAddLead) return setTaskOpen(true);
    setPlusOpen(true);
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 space-y-4 pb-24">
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

      {tab === "tasks" && <TasksTab meta={meta} taskSheetOpen={taskOpen} onTaskSheetOpenChange={setTaskOpen} />}
      {tab === "projects" && <ProjectsTab meta={meta} />}
      {tab === "leads" && <LeadsTab meta={meta} addOpen={leadOpen} onAddOpenChange={setLeadOpen} />}
      {tab === "targets" && <TargetsTab meta={meta} />}

      {(tab === "tasks" || tab === "leads") && (
        <button
          type="button"
          onClick={plus}
          aria-label="Add"
          className="fixed bottom-24 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 md:bottom-8"
        >
          <Plus className="size-7" />
        </button>
      )}

      <Sheet open={plusOpen} onOpenChange={setPlusOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Add</SheetTitle>
          </SheetHeader>
          <div className="grid gap-2.5 px-4 pb-6">
            <button type="button" className="min-h-14 rounded-xl border text-base font-semibold" onClick={() => { setPlusOpen(false); setTab("tasks"); setTaskOpen(true); }}>
              Add a task
            </button>
            <button type="button" className="min-h-14 rounded-xl border text-base font-semibold" onClick={() => { setPlusOpen(false); setTab("leads"); setLeadOpen(true); }}>
              Add a lead
            </button>
          </div>
        </SheetContent>
      </Sheet>
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
