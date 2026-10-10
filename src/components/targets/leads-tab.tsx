"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, LayoutGrid, List, Plus, Search, Upload } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportXLSX } from "@/lib/export";
import { exportRowForLead } from "@/lib/lead-import";
import { LeadImportSheet } from "@/components/targets/lead-import-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STAGES, stageLabel, type LeadStage } from "@/lib/lead-stages";
import { inr } from "@/lib/format";
import { istDateString } from "@/lib/ist-date";
import type { LeadDto } from "@/lib/targets-types";
import { fetchAllLeads, useLeads, usePatchLead, type TargetsMeta } from "@/hooks/use-targets";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { STAGE_STYLE, useStaffLookup } from "@/components/targets/shared";
import { LeadCard } from "@/components/targets/lead-card";
import { StageSheet } from "@/components/targets/stage-sheet";
import { cn } from "@/lib/utils";

const ALL = "all";
type View = "list" | "board";

/** Same layout rules as the Orders screen: a labelled filter row, List | Board, and on the board a 3×2 grid of stage pills on phones (one stage at a time, no sideways scroll) or coloured drag-and-drop columns on desktop. */
export function LeadsTab({ meta }: { meta: TargetsMeta | undefined }) {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [stage, setStage] = useState<string>(ALL);
  const [mobileStage, setMobileStage] = useState<LeadStage>("new");
  const [q, setQ] = useState("");
  const [likely, setLikely] = useState(ALL);
  const [owner, setOwner] = useState(ALL);
  const [added, setAdded] = useState<"all" | "month">("all");
  const [moving, setMoving] = useState<LeadDto | null>(null);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);

  const patch = usePatchLead();
  const { nameOf, active } = useStaffLookup(meta);
  // The search runs in the database, so wait for a pause in typing instead of asking on every keystroke.
  const search = useDebouncedValue(q.trim(), 300);
  const query = useLeads({ stage: "all", owner: owner === ALL ? undefined : owner, q: search || undefined, likely: likely === "likely" || undefined, limit: 1000 });
  const today = meta?.today ?? "";
  const labels = meta?.stageLabels;
  const showOwner = !!meta?.can.viewAll;
  const canMove = !!meta?.can.manageLeads;

  const monthStart = today.slice(0, 8) + "01";
  const leads = (query.data?.leads ?? []).filter((l) => added === "all" || istDateString(new Date(l.createdAt)) >= monthStart); // shop-local (IST) day, not the UTC one
  const byStage = (s: string) => leads.filter((l) => l.stage === s);
  const listLeads = stage === ALL ? leads : byStage(stage);
  const wonPct = leads.length ? Math.round((byStage("won").length / leads.length) * 100) : 0;

  async function exportAll() {
    setExporting(true);
    try {
      const all = await fetchAllLeads();
      if (all.length === 0) return toast.info("No leads to export yet");
      await exportXLSX(all.map((l) => exportRowForLead(l, nameOf(l.assignedEmployeeId) === "Not assigned" ? "" : nameOf(l.assignedEmployeeId), labels)), "leads", "Leads");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't export the leads");
    } finally {
      setExporting(false);
    }
  }

  function dropOn(target: string) {
    const id = draggingRef.current;
    draggingRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === target) return;
    if (target === "won" || target === "lost") {
      setMoveTo(target);
      setMoving(lead);
      return;
    }
    patch.mutate({ id: lead.id, stage: target }, { onSuccess: () => toast.success(`Moved to ${stageLabel(target, labels)}`), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't move the lead") });
  }

  const card = (l: LeadDto, compact?: boolean) => (
    <LeadCard
      key={l.id}
      lead={l}
      compact={compact}
      today={today}
      labels={labels}
      ownerName={showOwner ? nameOf(l.assignedEmployeeId) : undefined}
      onStageTap={
        canMove
          ? (x) => {
              setMoveTo(null);
              setMoving(x);
            }
          : undefined
      }
    />
  );

  function column(s: LeadStage, className?: string, compact?: boolean) {
    const items = byStage(s);
    const sum = items.reduce((a, l) => a + l.expectedValue, 0);
    return (
      <section
        key={s}
        className={className}
        onDragOver={(e) => {
          if (!canMove || !draggingRef.current) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTarget(s);
        }}
        onDragLeave={() => setDropTarget((t) => (t === s ? null : t))}
        onDrop={(e) => {
          if (!canMove) return;
          e.preventDefault();
          dropOn(s);
        }}
      >
        <header className={cn("flex items-center gap-2 rounded-t-xl border border-b-0 px-3 py-2.5", STAGE_STYLE[s])}>
          <h2 className="flex-1 truncate text-sm font-semibold">{stageLabel(s, labels)}</h2>
          {sum > 0 && <span className="shrink-0 text-xs tabular-nums opacity-80">{inr(sum)}</span>}
          <span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium tabular-nums">{items.length}</span>
        </header>
        <div className={cn("min-h-[6rem] space-y-2 rounded-b-xl border bg-muted/20 p-2 transition-colors", dropTarget === s && draggingId && "border-primary bg-primary/5 ring-1 ring-primary")}>
          {items.map((l) => (
            <div
              key={l.id}
              draggable={canMove}
              onDragStart={(e) => {
                draggingRef.current = l.id;
                setDraggingId(l.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", l.id);
              }}
              onDragEnd={() => {
                draggingRef.current = null;
                setDraggingId(null);
                setDropTarget(null);
              }}
              className={cn(canMove && "cursor-grab", draggingId === l.id && "opacity-50")}
            >
              {card(l, compact)}
            </div>
          ))}
          {items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{dropTarget === s && draggingId ? "Drop here" : "Nothing here"}</p>}
        </div>
      </section>
    );
  }

  const filterLabel = "text-xs font-medium text-muted-foreground";

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or mobile" className="h-12 pl-9 text-base" />
        </div>
        {meta?.can.manageLeads && (
          <Button className="hidden h-12 shrink-0 sm:inline-flex" onClick={() => router.push("/targets/leads/new")}>
            <Plus className="size-4" /> New Lead
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="h-12 shrink-0 px-3" aria-label="Import or export leads" disabled={exporting}>
                <FileSpreadsheet className="size-5" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {meta?.can.manageLeads && (
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <Upload className="size-4" /> Import from Excel
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={exportAll}>
              <Download className="size-4" /> Export all leads
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Labelled filter row, like Orders */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap sm:items-end">
        {showOwner && (
          <div className="space-y-1 sm:w-44">
            <Label className={filterLabel}>Owner</Label>
            <Select value={owner} onValueChange={(v) => v && setOwner(v)}>
              <SelectTrigger className="h-11 w-full">
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
          </div>
        )}
        {view === "list" && (
          <div className="space-y-1 sm:w-40">
            <Label className={filterLabel}>Stage</Label>
            <Select value={stage} onValueChange={(v) => v && setStage(v)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue>{(v: unknown) => (v === ALL ? "All stages" : stageLabel(v as string, labels))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All stages ({leads.length})</SelectItem>
                {LEAD_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {stageLabel(s, labels)} ({byStage(s).length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1 sm:w-40">
          <Label className={filterLabel}>Likely to close</Label>
          <Select value={likely} onValueChange={(v) => v && setLikely(v)}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue>{(v: unknown) => (v === "likely" ? "★ Likely only" : "Any")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any</SelectItem>
              <SelectItem value="likely">★ Likely only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className={filterLabel}>Added</Label>
          <div className="flex gap-1.5">
            {(["all", "month"] as const).map((a) => (
              <button key={a} type="button" onClick={() => setAdded(a)} className={cn("min-h-11 rounded-lg border px-3 text-sm font-medium", added === a ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>
                {a === "all" ? "All time" : "This month"}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 sm:ml-auto sm:justify-end">
          <span className="text-xs text-muted-foreground">
            {leads.length} leads
            {added === "all" && query.data && query.data.total > query.data.leads.length && <> of {query.data.total} · newest shown, search to narrow</>}
          </span>
          <div className="w-44">
            <SegmentedToggle<View>
              ariaLabel="Lead view"
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: "List", icon: List },
                { value: "board", label: "Board", icon: LayoutGrid },
              ]}
            />
          </div>
        </div>
      </div>

      {query.isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!query.isLoading && leads.length === 0 && (
        <EmptyState
          title="No leads here"
          description="Add someone who's interested."
          action={
            meta?.can.manageLeads ? (
              <Button className="h-11" onClick={() => router.push("/targets/leads/new")}>
                <Plus className="size-4" /> New Lead
              </Button>
            ) : undefined
          }
        />
      )}

      {!query.isLoading && view === "list" && listLeads.length > 0 && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{listLeads.map((l) => card(l))}</div>}
      {!query.isLoading && view === "list" && leads.length > 0 && listLeads.length === 0 && <EmptyState title="No leads in this stage" />}

      {!query.isLoading && view === "board" && leads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-500" style={{ width: `${wonPct}%` }} />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{wonPct}% won</span>
          </div>

          {/* Phone: one stage at a time via a 3×2 grid of pills — no sideways scrolling */}
          <div className="sm:hidden">
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {LEAD_STAGES.map((s) => {
                const on = s === mobileStage;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setMobileStage(s)}
                    className={cn("flex min-h-11 items-center justify-center gap-1.5 truncate rounded-lg border px-2 text-xs font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground")}
                  >
                    <span className="truncate">{stageLabel(s, labels)}</span>
                    <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums", on ? "bg-primary-foreground/20" : "bg-muted")}>{byStage(s).length}</span>
                  </button>
                );
              })}
            </div>
            {column(mobileStage)}
          </div>

          {/* Tablet/desktop: all stages share the full width (3 per row, 6 on wide screens); drag a lead to move it */}
          <div className="hidden gap-2 sm:grid sm:grid-cols-3 xl:grid-cols-6">{LEAD_STAGES.map((s) => column(s, "min-w-0", true))}</div>
        </div>
      )}

      <StageSheet lead={moving} open={!!moving} onOpenChange={(o) => !o && setMoving(null)} labels={labels} initialStage={moveTo} />
      <LeadImportSheet open={importOpen} onOpenChange={setImportOpen} labels={labels} />
    </div>
  );
}
