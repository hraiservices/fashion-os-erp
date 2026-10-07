"use client";

import { useMemo, useState } from "react";
import { Search, History, Wallet, Trash2, FilePlus2, ArrowRight, Pencil, Activity } from "lucide-react";
import { useActivityLog } from "@/hooks/use-activity-log";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DatePicker, toISODate } from "@/components/ui/date-picker";

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toISODate(d);
}

/**
 * actionColor(), Stitching_Manager_Pro_v16.html ~line 12089 — the old app keyed off emoji
 * embedded in the action string. Log rows are historical data we can't rewrite, so we still
 * match on those markers, but render a real icon + themed colour instead of raw emoji.
 */
function actionVisual(action: string | null) {
  const a = action || "";
  if (a.includes("💰")) return { icon: Wallet, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" };
  if (a.includes("🗑️")) return { icon: Trash2, cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" };
  if (a.includes("📋")) return { icon: FilePlus2, cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
  if (a.includes("✅") || a.includes("→")) return { icon: ArrowRight, cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300" };
  if (a.includes("✏️")) return { icon: Pencil, cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };
  return { icon: Activity, cls: "bg-muted text-muted-foreground" };
}

/** Strips the leading emoji from legacy log strings now that we render a real icon. */
function cleanAction(action: string): string {
  return action.replace(/^[\p{Extended_Pictographic}️\s]+/u, "").trim() || action;
}

export default function ActivityLogPage() {
  // Defaults to the last 30 days — not the old hardcoded "most recent 300 rows ever" cap, which
  // quietly made older history invisible and unsearchable with no indication anything was
  // missing. "All time" (clear both dates) is one click away for a full audit.
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(toISODate(new Date()));
  const { data: logs, isLoading } = useActivityLog({ from: from || undefined, to: to || undefined });
  const [filter, setFilter] = useState("");
  const isAllTime = !from && !to;

  const filtered = useMemo(() => {
    if (!logs) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.action?.toLowerCase().includes(q) ||
        l.user_email?.toLowerCase().includes(q) ||
        l.order_id?.toLowerCase().includes(q) ||
        l.user_name?.toLowerCase().includes(q)
    );
  }, [logs, filter]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Activity Log"
        description={`${filtered.length} recorded actions`}
        actions={
          filtered.length > 0 && (
            <ExportMenu
              rows={filtered.map((l) => ({
                Time: l.created_at,
                User: l.user_email || "",
                Name: l.user_name || "",
                Action: l.action || "",
                OrderID: l.order_id || "",
                Details: l.details || "",
              }))}
              filename="activity_log"
            />
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" enterKeyHint="search" placeholder="Search actions, users, order IDs…" className="h-10 pl-9" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search log" />
        </div>
        <DatePicker value={from} onChange={setFrom} placeholder="From" className="w-36" />
        <span className="text-sm text-muted-foreground">to</span>
        <DatePicker value={to} onChange={setTo} placeholder="To" className="w-36" />
        <Button
          variant={isAllTime ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          All time
        </Button>
        {!isAllTime && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFrom(daysAgoISO(30));
              setTo(toISODate(new Date()));
            }}
          >
            Last 30 days
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={History} title={filter ? "No matching activity" : "No activity yet"} description={filter ? "Try a different search term." : undefined} />
      ) : (
        <ul className="overflow-hidden rounded-xl border bg-card divide-y">
          {filtered.map((l) => {
            const { icon: Icon, cls } = actionVisual(l.action);
            return (
              <li key={l.id} className="flex gap-3 p-3 sm:p-4">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${cls}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{cleanAction(l.action)}</p>
                  {l.details && <p className="mt-0.5 text-xs text-muted-foreground">{l.details}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {l.user_name || l.user_email} · {new Date(l.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
