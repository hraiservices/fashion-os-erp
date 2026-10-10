"use client";

import { useState } from "react";
import { Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STAGES, stageLabel } from "@/lib/lead-stages";
import { inr } from "@/lib/format";
import type { LeadDto } from "@/lib/targets-types";
import { useLeads, type TargetsMeta } from "@/hooks/use-targets";
import { useStaffLookup } from "@/components/targets/shared";
import { LeadCard } from "@/components/targets/lead-card";
import { StageSheet } from "@/components/targets/stage-sheet";
import { LeadFormSheet } from "@/components/targets/lead-form-sheet";
import { cn } from "@/lib/utils";

const ALL = "all";
type Layout = "cards" | "board";

/**
 * Leads: stage chips with counts, search, "Likely to close" filter, and one card per lead. On a
 * desktop the same data can be shown as columns. Moving a lead is always: tap its stage chip.
 */
export function LeadsTab({ meta, addOpen, onAddOpenChange }: { meta: TargetsMeta | undefined; addOpen: boolean; onAddOpenChange: (o: boolean) => void }) {
  const [stage, setStage] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [likely, setLikely] = useState(false);
  const [owner, setOwner] = useState(ALL);
  const [layout, setLayout] = useState<Layout>("cards");
  const [moving, setMoving] = useState<LeadDto | null>(null);

  const { nameOf, active } = useStaffLookup(meta);
  const q1 = useLeads({ stage: layout === "board" || stage === ALL ? undefined : stage, owner: owner === ALL ? undefined : owner, q: q.trim() || undefined, likely: likely || undefined });
  const leads = q1.data?.leads ?? [];
  const counts = q1.data?.stageCounts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const today = meta?.today ?? "";
  const labels = meta?.stageLabels;
  const showOwner = !!meta?.can.viewAll;

  const card = (l: LeadDto) => <LeadCard key={l.id} lead={l} today={today} labels={labels} ownerName={showOwner ? nameOf(l.assignedEmployeeId) : undefined} onStageTap={meta?.can.manageLeads ? setMoving : undefined} />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or mobile" className="h-12 pl-9 text-base" />
        </div>
        <button type="button" onClick={() => setLikely((v) => !v)} aria-pressed={likely} aria-label="Only likely to close" className={cn("flex size-12 shrink-0 items-center justify-center rounded-lg border", likely ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "bg-card")}>
          <Star className={cn("size-5", likely ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {layout === "cards" &&
          [{ key: ALL, label: "All", n: total }, ...LEAD_STAGES.map((s) => ({ key: s as string, label: stageLabel(s, labels), n: counts[s] ?? 0 }))].map((c) => (
            <button key={c.key} type="button" onClick={() => setStage(c.key)} className={cn("min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium", stage === c.key ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card")}>
              {c.label} <span className="ml-1 text-xs opacity-70">{c.n}</span>
            </button>
          ))}
        {showOwner && (
          <Select value={owner} onValueChange={(v) => v && setOwner(v)}>
            <SelectTrigger className="ml-auto h-11 w-40 shrink-0">
              <SelectValue>{(v: unknown) => (v === ALL ? "Everyone" : nameOf(v as string))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              {active.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto hidden shrink-0 rounded-lg border p-0.5 lg:flex">
          {(["cards", "board"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLayout(l)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", layout === l ? "bg-muted" : "text-muted-foreground")}>
              {l === "cards" ? "Cards" : "Board"}
            </button>
          ))}
        </div>
      </div>

      {q1.isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!q1.isLoading && leads.length === 0 && <EmptyState title="No leads here" description="Tap + to add someone who's interested." />}

      {layout === "cards" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{leads.map(card)}</div>}

      {layout === "board" && (
        <div className="hidden gap-3 lg:grid lg:grid-cols-6">
          {LEAD_STAGES.map((s) => {
            const col = leads.filter((l) => l.stage === s);
            const sum = col.reduce((a, l) => a + l.expectedValue, 0);
            return (
              <div key={s} className="min-w-0 space-y-2 rounded-xl bg-muted/30 p-2">
                <p className="px-1 text-sm font-semibold">
                  {stageLabel(s, labels)} <span className="font-normal text-muted-foreground">{col.length}</span>
                </p>
                {sum > 0 && <p className="px-1 text-xs text-muted-foreground">{inr(sum)}</p>}
                {col.map(card)}
              </div>
            );
          })}
        </div>
      )}

      <StageSheet lead={moving} open={!!moving} onOpenChange={(o) => !o && setMoving(null)} labels={labels} />
      <LeadFormSheet open={addOpen} onOpenChange={onAddOpenChange} meta={meta} />
    </div>
  );
}
