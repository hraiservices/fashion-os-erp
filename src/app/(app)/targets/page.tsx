"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListTodo, Plus, Target, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTargetsMeta } from "@/hooks/use-targets";
import { TodayTab } from "@/components/targets/today-tab";
import { LeadsTab } from "@/components/targets/leads-tab";
import { TargetsTab } from "@/components/targets/targets-tab";

type Tab = "today" | "leads" | "targets";

function TargetsHome() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "leads" || raw === "targets" ? raw : "today";
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
    if (wantNew) router.replace(tab === "today" ? "/targets" : `/targets?tab=${tab}`, { scroll: false });
  }, [wantNew, tab, router]);

  const setTab = (t: Tab) => router.replace(t === "today" ? "/targets" : `/targets?tab=${t}`, { scroll: false });
  const canAddLead = !!meta?.can.manageLeads;

  function plus() {
    if (tab === "leads" && canAddLead) return setLeadOpen(true);
    if (tab === "today" && !canAddLead) return setTaskOpen(true);
    if (tab === "targets") return setTaskOpen(true);
    setPlusOpen(true);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-24">
      <PageHeader title="Sales Targets" description="Today's work, your leads and your goals" />
      <SegmentedToggle<Tab>
        ariaLabel="Targets section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "today", label: "Today", icon: ListTodo },
          { value: "leads", label: "Leads", icon: Users },
          { value: "targets", label: "Targets", icon: Target },
        ]}
      />

      {tab === "today" && <TodayTab meta={meta} taskSheetOpen={taskOpen} onTaskSheetOpenChange={setTaskOpen} />}
      {tab === "leads" && <LeadsTab meta={meta} addOpen={leadOpen} onAddOpenChange={setLeadOpen} />}
      {tab === "targets" && <TargetsTab meta={meta} />}

      {/* Today: tasks live there, so only show the lead form when leads tab is open; sheets for the other tabs are mounted by the tab. */}
      {tab !== "leads" && leadOpen && <LeadsTab meta={meta} addOpen={leadOpen} onAddOpenChange={setLeadOpen} />}

      {tab !== "targets" && (
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
            <button type="button" className="min-h-14 rounded-xl border text-base font-semibold" onClick={() => { setPlusOpen(false); setTaskOpen(true); }}>
              Add a task
            </button>
            <button type="button" className="min-h-14 rounded-xl border text-base font-semibold" onClick={() => { setPlusOpen(false); setLeadOpen(true); }}>
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
