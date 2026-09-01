"use client";

import { useState } from "react";
import { SlidersHorizontal, ArrowDownUp, X, Bookmark, Trash2, Save } from "lucide-react";
import { STAGES, STAGE_META, type Stage } from "@/lib/business-rules";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import type { SavedView } from "@/hooks/use-saved-views";

export type DatePreset = "all" | "month" | "custom";
export type Priority = "all" | "overdue" | "soon" | "normal";
export type Sort = "newest" | "oldest";

export type OrderTypeFilter = "all" | "new" | "alteration";

export interface FilterState {
  tailor: string;
  stage: string;
  priority: Priority;
  sort: Sort;
  datePreset: DatePreset;
  customFrom: string;
  customTo: string;
  orderType: OrderTypeFilter;
}

export const EMPTY_FILTERS: FilterState = {
  tailor: "all",
  stage: "all",
  priority: "all",
  sort: "newest",
  datePreset: "all",
  customFrom: "",
  customTo: "",
  orderType: "all",
};

export function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.tailor !== "all") n++;
  if (f.stage !== "all") n++;
  if (f.priority !== "all") n++;
  if (f.datePreset !== "all") n++;
  if (f.orderType !== "all") n++;
  return n;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  all: "Any priority",
  overdue: "Overdue",
  soon: "Due soon",
  normal: "On track",
};

const ORDER_TYPE_LABEL: Record<OrderTypeFilter, string> = {
  all: "All types",
  new: "New orders",
  alteration: "Alterations",
};

// Base UI's SelectValue renders the raw stored value unless given a formatter, which
// would surface "all" / "received" instead of "All stages" / "Received".
const tailorLabel = (v: unknown) => (v === "all" ? "All tailors" : String(v ?? ""));
const stageLabel = (v: unknown) => (v === "all" ? "All stages" : (STAGE_META[v as Stage]?.label ?? String(v ?? "")));
const priorityLabel = (v: unknown) => PRIORITY_LABEL[v as Priority] ?? String(v ?? "");
const orderTypeLabel = (v: unknown) => ORDER_TYPE_LABEL[v as OrderTypeFilter] ?? String(v ?? "");

function TailorSelect({ value, onChange, tailors }: { value: string; onChange: (v: string) => void; tailors: { id: string; name: string }[] }) {
  const label = (v: unknown) => (v === "all" ? "All tailors" : tailors.find((t) => t.id === v)?.name ?? tailorLabel(v));
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="h-10 w-full">
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All tailors</SelectItem>
        {tailors.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="h-10 w-full">
        <SelectValue>{stageLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All stages</SelectItem>
        {STAGES.map((s) => (
          <SelectItem key={s} value={s}>
            {STAGE_META[s].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PrioritySelect({ value, onChange }: { value: Priority; onChange: (v: Priority) => void }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as Priority)}>
      <SelectTrigger className="h-10 w-full">
        <SelectValue>{priorityLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
          <SelectItem key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OrderTypeSelect({ value, onChange }: { value: OrderTypeFilter; onChange: (v: OrderTypeFilter) => void }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as OrderTypeFilter)}>
      <SelectTrigger className="h-10 w-full">
        <SelectValue>{orderTypeLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(ORDER_TYPE_LABEL) as OrderTypeFilter[]).map((t) => (
          <SelectItem key={t} value={t}>
            {ORDER_TYPE_LABEL[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DatePresetButtons({ value, onChange }: { value: DatePreset; onChange: (v: DatePreset) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["all", "month", "custom"] as DatePreset[]).map((p) => (
        <Button key={p} type="button" variant={value === p ? "default" : "outline"} size="default" onClick={() => onChange(p)}>
          {p === "all" ? "All time" : p === "month" ? "This month" : "Custom"}
        </Button>
      ))}
    </div>
  );
}

/** "Views" list + save-as-new-view row, shown inside the mobile Filters sheet. */
function SavedViewsSection<F>({ views, onApply, onSave, onRemove, currentFilters }: { views: SavedView<F>[]; onApply: (f: F) => void; onSave: (name: string, f: F) => void; onRemove: (id: string) => void; currentFilters: F }) {
  const [name, setName] = useState("");
  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, currentFilters);
    setName("");
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs">Saved views</Label>
      {views.length === 0 ? (
        <p className="text-xs text-muted-foreground">No saved views yet — set your filters, then save one below.</p>
      ) : (
        <div className="space-y-1">
          {views.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" onClick={() => onApply(v.filters)}>
                <Bookmark className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{v.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(v.id)}
                aria-label={`Delete view ${v.name}`}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Input placeholder="Save current filters as…" className="h-9 flex-1 text-xs" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} />
        <Button type="button" variant="outline" size="sm" onClick={handleSave} disabled={!name.trim()} aria-label="Save view">
          <Save className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Desktop: inline filter bar. Mobile: a single "Filters" button opening a bottom sheet. */
export function OrderFilters<F>({
  value,
  onChange,
  tailors,
  resultCount,
  mobileOpen,
  onMobileOpenChange,
  views,
  onApplyView,
  onSaveView,
  onRemoveView,
  currentViewFilters,
}: {
  value: FilterState;
  onChange: (f: FilterState) => void;
  tailors: { id: string; name: string }[];
  resultCount: number;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  /** Saved-views data — shown as a "Views" section inside the mobile Filters sheet. */
  views: SavedView<F>[];
  onApplyView: (f: F) => void;
  onSaveView: (name: string, f: F) => void;
  onRemoveView: (id: string) => void;
  currentViewFilters: F;
}) {
  const count = activeFilterCount(value);
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const toggleSort = () => set({ sort: value.sort === "newest" ? "oldest" : "newest" });

  return (
    <>
      {/* Mobile trigger row */}
      <div className="flex items-center gap-2 md:hidden">
        <Button
          variant="outline"
          size="sm"
          className="relative h-10 w-10 flex-1 px-0"
          onClick={() => onMobileOpenChange(true)}
          aria-label="Filters"
        >
          <SlidersHorizontal className="size-4" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{count}</span>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-10 w-10 shrink-0 px-0"
          onClick={toggleSort}
          aria-label={value.sort === "newest" ? "Sorted newest first — tap for oldest first" : "Sorted oldest first — tap for newest first"}
        >
          <ArrowDownUp className="size-4" />
        </Button>
      </div>

      {/* Desktop inline bar */}
      <div className="hidden flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border bg-card p-3 md:flex">
        <div className="w-40">
          <Label className="mb-1.5 block text-xs text-muted-foreground">Tailor</Label>
          <TailorSelect value={value.tailor} onChange={(v) => set({ tailor: v })} tailors={tailors} />
        </div>
        <div className="w-40">
          <Label className="mb-1.5 block text-xs text-muted-foreground">Stage</Label>
          <StageSelect value={value.stage} onChange={(v) => set({ stage: v })} />
        </div>
        <div className="w-36">
          <Label className="mb-1.5 block text-xs text-muted-foreground">Priority</Label>
          <PrioritySelect value={value.priority} onChange={(v) => set({ priority: v })} />
        </div>
        <div className="w-36">
          <Label className="mb-1.5 block text-xs text-muted-foreground">Order type</Label>
          <OrderTypeSelect value={value.orderType} onChange={(v) => set({ orderType: v })} />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Order date</Label>
          <DatePresetButtons value={value.datePreset} onChange={(v) => set({ datePreset: v })} />
        </div>
        {value.datePreset === "custom" && (
          <div className="flex items-center gap-2">
            <DatePicker className="w-36" value={value.customFrom} onChange={(v) => set({ customFrom: v })} />
            <span className="text-xs text-muted-foreground">to</span>
            <DatePicker className="w-36" value={value.customTo} onChange={(v) => set({ customTo: v })} />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {count > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...EMPTY_FILTERS, sort: value.sort })}>
              <X className="size-3.5" /> Clear
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={toggleSort}>
            <ArrowDownUp className="size-3.5" />
            {value.sort === "newest" ? "Newest first" : "Oldest first"}
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">{resultCount} orders</span>
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filter orders</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <SavedViewsSection
              views={views}
              onApply={(f) => {
                onApplyView(f);
                onMobileOpenChange(false);
              }}
              onSave={onSaveView}
              onRemove={onRemoveView}
              currentFilters={currentViewFilters}
            />
            <div className="space-y-1.5 border-t pt-4">
              <Label className="text-xs">Tailor</Label>
              <TailorSelect value={value.tailor} onChange={(v) => set({ tailor: v })} tailors={tailors} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Stage</Label>
              <StageSelect value={value.stage} onChange={(v) => set({ stage: v })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <PrioritySelect value={value.priority} onChange={(v) => set({ priority: v })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Order type</Label>
              <OrderTypeSelect value={value.orderType} onChange={(v) => set({ orderType: v })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Order date</Label>
              <DatePresetButtons value={value.datePreset} onChange={(v) => set({ datePreset: v })} />
              {value.datePreset === "custom" && (
                <div className="mt-2 flex items-center gap-2">
                  <DatePicker value={value.customFrom} onChange={(v) => set({ customFrom: v })} />
                  <span className="text-xs text-muted-foreground">to</span>
                  <DatePicker value={value.customTo} onChange={(v) => set({ customTo: v })} />
                </div>
              )}
            </div>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onChange({ ...EMPTY_FILTERS, sort: value.sort })}>
              Clear all
            </Button>
            <Button className="flex-1" onClick={() => onMobileOpenChange(false)}>
              Show {resultCount} orders
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
