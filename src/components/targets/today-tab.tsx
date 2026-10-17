"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, Clock, Flame, PartyPopper, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAddLeadActivity, useLeads, usePatchTask, type TargetsMeta } from "@/hooks/use-targets";
import { useLeadFollowUp } from "@/hooks/use-lead-follow-up";
import { todayBuckets } from "@/lib/lead-insights";
import type { LeadDto } from "@/lib/targets-types";
import { LeadCard } from "@/components/targets/lead-card";
import { StageSheet } from "@/components/targets/stage-sheet";
import { OccasionsCard, ReviewRequestCard } from "@/components/targets/today-customers";
import { DailyPlanCard, FestivalNudgeCard, InsightsCard, OrderRiskCard } from "@/components/targets/today-ai";
import { useStaffLookup } from "@/components/targets/shared";
import { cn } from "@/lib/utils";

const SNOOZE: { days: number; label: string }[] = [
  { days: 1, label: "Tomorrow" },
  { days: 3, label: "In 3 days" },
  { days: 7, label: "Next week" },
];

/**
 * "Who do I contact today?" — open leads sorted into what needs you now: a follow-up due or overdue, leads that have gone
 * quiet, and hot leads. Each card has Call / WhatsApp, then Done (logs the contact and completes the follow-up) or Snooze
 * (moves the follow-up out), so the list empties as you work through it.
 */
export function TodayTab({ meta }: { meta: TargetsMeta | undefined }) {
  const query = useLeads({ stage: "open", limit: 1000 });
  const today = meta?.today ?? "";
  const labels = meta?.stageLabels;
  const canEdit = !!meta?.can.manageLeads;
  const { nameOf } = useStaffLookup(meta);
  const showOwner = !!meta?.can.viewAll;
  const addActivity = useAddLeadActivity();
  const patchTask = usePatchTask();
  const followUp = useLeadFollowUp(meta);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [moving, setMoving] = useState<LeadDto | null>(null);

  const buckets = useMemo(() => todayBuckets(query.data?.leads ?? [], today), [query.data, today]);
  const total = buckets.due.length + buckets.quiet.length + buckets.hot.length;

  async function markDone(lead: LeadDto) {
    setBusy(lead.id);
    try {
      if (lead.nextFollowUp) await patchTask.mutateAsync({ id: lead.nextFollowUp.id, status: "done" });
      await addActivity.mutateAsync({ id: lead.id, kind: "note", body: "Contacted (from the Today list)" });
      // The lead lists show each lead's next follow-up and last activity, so read them again.
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "targets" && ["leads", "lead", "tasks", "summary"].includes(q.queryKey[1] as string) });
      toast.success(`${lead.name}: contacted`, { action: { label: "Follow up in 3 days", onClick: () => followUp.schedule({ ...lead, nextFollowUp: null }, 3, { forceNew: true }).then(() => toast.success("Follow-up set for in 3 days"), (e) => toast.error(e instanceof Error ? e.message : "Couldn't set it")) }, duration: 8000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that");
    } finally {
      setBusy(null);
    }
  }

  async function snooze(lead: LeadDto, days: number, label: string) {
    setBusy(lead.id);
    try {
      await followUp.schedule(lead, days);
      toast.success(`${lead.name}: follow-up ${label.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't move the follow-up");
    } finally {
      setBusy(null);
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const sections = [
    { key: "due", title: "Follow-ups due", hint: "Due today or overdue", icon: BellRing, tone: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-500/10 dark:border-red-500/30", leads: buckets.due },
    { key: "quiet", title: "Gone quiet", hint: "No activity for 3+ days", icon: Clock, tone: "text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30", leads: buckets.quiet },
    { key: "hot", title: "Hot leads", hint: "Most likely to close", icon: Flame, tone: "text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-500/10 dark:border-orange-500/30", leads: buckets.hot },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {total > 0 ? (
            <>
              <span className="font-semibold text-foreground">{total}</span> {total === 1 ? "lead" : "leads"} to contact today
            </>
          ) : (
            "Nobody is waiting on you right now."
          )}
        </p>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" className="h-11" nativeButton={false} render={<Link href="/targets/leads/new" />}>
              <Plus className="size-4" /> New lead
            </Button>
          )}
          <Button variant="ghost" className="h-11" nativeButton={false} render={<Link href="/targets?tab=leads" />}>
            All leads
          </Button>
        </div>
      </div>

      <OrderRiskCard today={today} />
      <DailyPlanCard today={today} buckets={buckets} />
      <FestivalNudgeCard canEdit={canEdit} />
      <OccasionsCard today={today} canEdit={canEdit} />
      <ReviewRequestCard today={today} canEdit={canEdit} />
      {showOwner && <InsightsCard />}

      {total === 0 && <EmptyState icon={PartyPopper} title="All caught up" description="No follow-ups are due and no open lead has gone quiet. New leads you add will show here when they need you." />}

      {sections.map(
        (sec) =>
          sec.leads.length > 0 && (
            <section key={sec.key} className="space-y-2">
              <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", sec.tone)}>
                <sec.icon className="size-4 shrink-0" />
                <h2 className="text-sm font-semibold">{sec.title}</h2>
                <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs font-semibold tabular-nums">{sec.leads.length}</span>
                <span className="ml-auto truncate text-xs opacity-80">{sec.hint}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sec.leads.map((l) => (
                  <div key={l.id} className="overflow-hidden rounded-xl">
                    <LeadCard lead={l} today={today} labels={labels} ownerName={showOwner ? nameOf(l.assignedEmployeeId) : undefined} onStageTap={canEdit ? setMoving : undefined} className="rounded-b-none border-b-0" />
                    {canEdit && (
                      <div className="grid grid-cols-2 gap-px rounded-b-xl border bg-border">
                        <button type="button" disabled={busy === l.id} onClick={() => markDone(l)} className="flex min-h-12 items-center justify-center gap-1.5 bg-card text-sm font-semibold text-emerald-700 active:bg-muted/60 disabled:opacity-50 dark:text-emerald-400">
                          <Check className="size-4" /> Done
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button type="button" disabled={busy === l.id} className="flex min-h-12 items-center justify-center gap-1.5 bg-card text-sm font-semibold text-blue-700 active:bg-muted/60 disabled:opacity-50 dark:text-blue-400">
                                <Clock className="size-4" /> Snooze
                              </button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            {SNOOZE.map((o) => (
                              <DropdownMenuItem key={o.days} onClick={() => snooze(l, o.days, o.label)} className="min-h-11">
                                {o.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )
      )}

      <StageSheet lead={moving} open={!!moving} onOpenChange={(o) => !o && setMoving(null)} labels={labels} />
    </div>
  );
}
