"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, CheckSquare, ChevronLeft, ChevronRight, Link2, Plus, Square, StickyNote, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimePicker } from "@/components/ui/time-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareButton } from "@/components/targets/share-dialog";
import { weekStart } from "@/components/targets/week-calendar";
import {
  useCreatePlannerEntry,
  useCreateTask,
  useDeletePlannerEntry,
  useLeads,
  usePlannerEntries,
  useUpdatePlannerEntry,
  type TargetsMeta,
} from "@/hooks/use-targets";
import { useCustomers } from "@/hooks/use-customers";
import { useOrders } from "@/hooks/use-orders";
import { addDaysIso } from "@/lib/work-tasks";
import { PLANNER_KINDS, PLANNER_KIND_LABELS, type PlannerKind, type PlannerLinkType } from "@/lib/planner";
import { shareDate, type ShareMessage } from "@/lib/targets-share";
import { TONES } from "@/lib/ui-tones";
import type { PlannerEntryDto } from "@/lib/targets-types";
import { cn } from "@/lib/utils";

const KIND_TONE: Record<PlannerKind, "blue" | "amber"> = { note: "blue", todo: "amber" };
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "3:00 PM" from a stored reminder_at (an ISO instant) — read in the viewer's own local clock,
 *  same as the TimePicker that set it. */
function reminderTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** Combines a YYYY-MM-DD date and an HH:MM (24h) time, both read in the browser's own local
 *  clock (the shop's, in practice), into the ISO instant the server stores. */
function toReminderIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

interface LinkChoice {
  type: PlannerLinkType;
  id: string;
  label: string;
}

/** The "Link to…" popover: search leads/customers/orders by name and attach one. Not a live
 *  @-mention-while-typing (nothing in this codebase does that yet) — just a small search-and-pick. */
function LinkPicker({ value, onChange }: { value: LinkChoice | null; onChange: (v: LinkChoice | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const leads = useLeads({ stage: "open", limit: 200 }, { enabled: open });
  const { data: customers } = useCustomers();
  const { data: orders } = useOrders();

  const q = query.trim().toLowerCase();
  const leadMatches = q ? (leads.data?.leads ?? []).filter((l) => l.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const customerMatches = q ? (customers ?? []).filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const orderMatches = q ? (orders ?? []).filter((o) => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)).slice(0, 5) : [];

  function pick(choice: LinkChoice) {
    onChange(choice);
    setOpen(false);
    setQuery("");
  }

  if (value) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs">
        <Link2 className="size-3" /> {value.label}
        <button type="button" aria-label="Remove link" onClick={() => onChange(null)} className="ml-0.5 text-muted-foreground hover:text-foreground">
          <X className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
            <Link2 className="size-3.5" /> Link to…
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72">
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads, customers, orders…" className="h-9" />
        {q && (
          <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
            {leadMatches.length > 0 && (
              <div>
                <p className="px-1 text-[10px] font-medium uppercase text-muted-foreground">Leads</p>
                {leadMatches.map((l) => (
                  <button key={l.id} type="button" onClick={() => pick({ type: "lead", id: l.id, label: l.name })} className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                    {l.name}
                  </button>
                ))}
              </div>
            )}
            {customerMatches.length > 0 && (
              <div>
                <p className="px-1 text-[10px] font-medium uppercase text-muted-foreground">Customers</p>
                {customerMatches.map((c) => (
                  <button key={c.id} type="button" onClick={() => pick({ type: "customer", id: c.id, label: c.name })} className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {orderMatches.length > 0 && (
              <div>
                <p className="px-1 text-[10px] font-medium uppercase text-muted-foreground">Orders</p>
                {orderMatches.map((o) => (
                  <button key={o.id} type="button" onClick={() => pick({ type: "order", id: o.id, label: `Order ${o.id} — ${o.name}` })} className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                    Order {o.id} — {o.name}
                  </button>
                ))}
              </div>
            )}
            {!leadMatches.length && !customerMatches.length && !orderMatches.length && <p className="px-1 py-2 text-sm text-muted-foreground">No matches</p>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Add-entry composer for one date — text, note/to-do toggle, optional reminder time, optional link. */
function Composer({ date, onAdded }: { date: string; onAdded: () => void }) {
  const create = useCreatePlannerEntry();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<PlannerKind>("note");
  const [reminder, setReminder] = useState(false);
  const [time, setTime] = useState("09:00");
  const [link, setLink] = useState<LinkChoice | null>(null);

  async function submit() {
    if (!text.trim()) return;
    try {
      await create.mutateAsync({
        entryDate: date,
        kind,
        text: text.trim(),
        reminderAt: reminder ? toReminderIso(date, time) : null,
        linkType: link?.type ?? null,
        linkId: link?.id ?? null,
        linkLabel: link?.label ?? "",
      });
      setText("");
      setReminder(false);
      setLink(null);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that");
    }
  }

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={kind === "todo" ? "Add a to-do…" : "Write a note…"}
          className="h-10"
        />
        <Button type="button" className="h-10 shrink-0" disabled={!text.trim() || create.isPending} onClick={submit}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedToggle<PlannerKind> ariaLabel="Entry type" value={kind} onChange={setKind} options={PLANNER_KINDS.map((k) => ({ value: k, label: PLANNER_KIND_LABELS[k] }))} />
        <Button type="button" variant={reminder ? "default" : "ghost"} size="sm" className="h-7 gap-1 text-xs" onClick={() => setReminder((v) => !v)}>
          <Bell className="size-3.5" /> Remind me
        </Button>
        {reminder && <TimePicker value={time} onChange={setTime} className="h-7 w-auto" />}
        <LinkPicker value={link} onChange={setLink} />
      </div>
    </div>
  );
}

function EntryRow({ entry, today, onToggleDone, onDelete, onConvert }: { entry: PlannerEntryDto; today: string; onToggleDone: () => void; onDelete: () => void; onConvert: () => void }) {
  const tone = TONES[KIND_TONE[entry.kind]];
  const message: ShareMessage = {
    subject: entry.kind === "todo" ? "Planner to-do" : "Planner note",
    text: [`${entry.kind === "todo" ? "✅" : "📝"} ${entry.text}`, entry.reminderAt ? `Remind at ${reminderTimeLabel(entry.reminderAt)} — ${shareDate(entry.entryDate, today)}` : `For ${shareDate(entry.entryDate, today)}`, entry.linkLabel ? `Re: ${entry.linkLabel}` : ""].filter(Boolean).join("\n"),
  };
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-card p-2.5">
      {entry.kind === "todo" ? (
        <button type="button" aria-label={entry.done ? "Mark not done" : "Mark done"} onClick={onToggleDone} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
          {entry.done ? <CheckSquare className="size-4 text-emerald-600 dark:text-emerald-400" /> : <Square className="size-4" />}
        </button>
      ) : (
        <StickyNote className={cn("mt-0.5 size-4 shrink-0", "text-blue-600 dark:text-blue-400")} />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn("text-sm", entry.done && "text-muted-foreground line-through")}>{entry.text}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", tone.badge)}>{PLANNER_KIND_LABELS[entry.kind]}</span>
          {entry.reminderAt && (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium", TONES.rose.badge)}>
              <Bell className="size-2.5" /> {reminderTimeLabel(entry.reminderAt)}
            </span>
          )}
          {entry.linkLabel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Link2 className="size-2.5" /> {entry.linkLabel}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {entry.kind === "todo" && !entry.done && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={onConvert}>
            To task
          </Button>
        )}
        <ShareButton title="Share" iconOnly size="sm" build={() => message} />
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete" className="size-7 text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function DayColumn({ date, today, entries, isToday, onAdded }: { date: string; today: string; entries: PlannerEntryDto[]; isToday: boolean; onAdded: () => void }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const update = useUpdatePlannerEntry();
  const del = useDeletePlannerEntry();
  const createTask = useCreateTask();

  async function convert(entry: PlannerEntryDto) {
    try {
      await createTask.mutateAsync({ title: entry.text, dueDate: entry.entryDate });
      toast.success("Added to your tasks");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the task");
    }
  }

  return (
    <div className={cn("min-w-0 space-y-2 rounded-xl border p-2", isToday ? "border-primary bg-primary/5" : "bg-card")}>
      <div className="flex items-center justify-between gap-1">
        <p className={cn("text-xs font-semibold", isToday ? "text-primary" : "text-muted-foreground")}>{dayLabel(date)}</p>
        <Popover open={composerOpen} onOpenChange={setComposerOpen}>
          <PopoverTrigger
            render={
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Add to ${dayLabel(date)}`} className="size-6">
                <Plus className="size-3.5" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-80">
            <Composer
              date={date}
              onAdded={() => {
                setComposerOpen(false);
                onAdded();
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-1.5">
        {entries.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">Nothing yet</p>
        ) : (
          entries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              today={today}
              onToggleDone={() => update.mutate({ id: e.id, done: !e.done })}
              onDelete={() => del.mutate(e.id)}
              onConvert={() => convert(e)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Targets > Planner — a private daily/weekly agenda, separate from Leads/Tasks: freeform notes and
 * to-do lines, each optionally reminding you (a once-daily push, not an exact-minute alert — see
 * src/app/api/cron/planner-reminders/route.ts) and optionally pointing at a lead/customer/order.
 * Nobody but the person who wrote an entry can ever see it, not even an admin with "see everyone's
 * work" on — this is deliberately NOT shared like the rest of Targets.
 */
export function PlannerTab({ meta }: { meta: TargetsMeta | undefined }) {
  const today = meta?.today || new Date().toISOString().slice(0, 10);
  const [view, setView] = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState(today);

  const from = view === "day" ? anchor : weekStart(anchor);
  const to = view === "day" ? anchor : addDaysIso(weekStart(anchor), 6);
  const query = usePlannerEntries(from, to);
  const update = useUpdatePlannerEntry();
  const del = useDeletePlannerEntry();
  const createTask = useCreateTask();

  const byDate = useMemo(() => {
    const map = new Map<string, PlannerEntryDto[]>();
    for (const e of query.data ?? []) map.set(e.entryDate, [...(map.get(e.entryDate) ?? []), e]);
    return map;
  }, [query.data]);

  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDaysIso(from, i)) : [anchor];

  async function convert(entry: PlannerEntryDto) {
    try {
      await createTask.mutateAsync({ title: entry.text, dueDate: entry.entryDate });
      toast.success("Added to your tasks");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the task");
    }
  }

  if (!meta) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label={view === "day" ? "Previous day" : "Previous week"} onClick={() => setAnchor((d) => addDaysIso(d, view === "day" ? -1 : -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label={view === "day" ? "Next day" : "Next week"} onClick={() => setAnchor((d) => addDaysIso(d, view === "day" ? 1 : 7))}>
          <ChevronRight className="size-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{view === "day" ? dayLabel(anchor) : `${dayLabel(from)} – ${dayLabel(to)}`}</p>
        <Button type="button" variant="outline" className="h-11" onClick={() => setAnchor(today)}>
          Today
        </Button>
        <SegmentedToggle<"day" | "week"> ariaLabel="Planner view" value={view} onChange={setView} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]} />
      </div>

      {query.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : view === "day" ? (
        <div className="space-y-3">
          <Composer date={anchor} onAdded={() => {}} />
          {(byDate.get(anchor) ?? []).length === 0 ? (
            <EmptyState title="Nothing planned for this day" description="Add a note or a to-do above." />
          ) : (
            <div className="space-y-2">
              {(byDate.get(anchor) ?? []).map((e) => (
                <EntryRow key={e.id} entry={e} today={today} onToggleDone={() => update.mutate({ id: e.id, done: !e.done })} onDelete={() => del.mutate(e.id)} onConvert={() => convert(e)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {days.map((d) => (
            <DayColumn key={d} date={d} today={today} entries={byDate.get(d) ?? []} isToday={d === today} onAdded={() => query.refetch()} />
          ))}
        </div>
      )}
    </div>
  );
}
