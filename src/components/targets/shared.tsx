"use client";

import { useMemo } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_STAGE_LABELS, stageLabel, type LeadStage, type StageLabelOverrides } from "@/lib/lead-stages";
import { TARGET_STATUS_LABELS, type TargetStatus } from "@/lib/targets";
import { daysBetween } from "@/lib/targets";
import { fmtDateShort } from "@/lib/format";
import { normalizeIndianMobile } from "@/lib/business-rules";
import type { TargetsMeta } from "@/hooks/use-targets";

/** Small building blocks shared by the Targets screens. Everything is sized for a thumb (44px+ hit areas). */

export function useStaffLookup(meta: TargetsMeta | undefined) {
  return useMemo(() => {
    const staff = meta?.staff ?? [];
    const byId = new Map(staff.map((s) => [s.id, s]));
    return {
      staff,
      active: staff.filter((s) => s.active),
      nameOf: (id: string | null | undefined) => (id ? byId.get(id)?.name ?? "Unknown" : "Not assigned"),
    };
  }, [meta]);
}

// ── Stage chip ────────────────────────────────────────────────────────────

export const STAGE_STYLE: Record<LeadStage, string> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  talking: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  visit: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  quoted: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  won: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  lost: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function StageChip({ stage, labels, className }: { stage: string; labels?: StageLabelOverrides; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold", STAGE_STYLE[stage as LeadStage] ?? STAGE_STYLE.new, className)}>
      {stageLabel(stage, labels)}
    </span>
  );
}

export { DEFAULT_STAGE_LABELS };

export function LikelyStar({ on, className }: { on: boolean; className?: string }) {
  return <Star className={cn("size-4", on ? "fill-amber-400 text-amber-500" : "text-muted-foreground/40", className)} aria-label={on ? "Likely to close" : "Not marked likely"} />;
}

// ── Target status chip + progress bar ─────────────────────────────────────

const STATUS_STYLE: Record<TargetStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
  upcoming: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  on_track: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  at_risk: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  achieved: "bg-emerald-600 text-white",
  missed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function TargetStatusChip({ status }: { status: TargetStatus }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLE[status])}>{TARGET_STATUS_LABELS[status]}</span>;
}

const BAR_FILL: Record<TargetStatus, string> = {
  draft: "bg-muted-foreground/40",
  cancelled: "bg-muted-foreground/40",
  upcoming: "bg-slate-400",
  on_track: "bg-emerald-500",
  at_risk: "bg-amber-500",
  achieved: "bg-emerald-600",
  missed: "bg-red-500",
};

/** A progress bar with a thin marker where the pro-rata pace says you should be by now. */
export function ProgressBar({ pct, expectedPct, status, className }: { pct: number; expectedPct?: number; status: TargetStatus; className?: string }) {
  const fill = Math.min(100, Math.max(0, pct));
  return (
    <div className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(fill)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", BAR_FILL[status])} style={{ width: `${fill}%` }} />
      {expectedPct != null && expectedPct > 0 && expectedPct < 100 && <div className="absolute inset-y-0 w-0.5 bg-foreground/40" style={{ left: `${expectedPct}%` }} title="Where you should be by now" />}
    </div>
  );
}

// ── Dates ─────────────────────────────────────────────────────────────────

/** "Today", "Tomorrow", "Overdue 3d", "12 Sep" — and how loudly to show it. */
export function dueLabel(due: string | null, today: string): { text: string; tone: "late" | "today" | "soon" | "later" | "none" } {
  if (!due) return { text: "No date", tone: "none" };
  const diff = daysBetween(today, due);
  if (diff < 0) return { text: `Overdue ${-diff}d`, tone: "late" };
  if (diff === 0) return { text: "Today", tone: "today" };
  if (diff === 1) return { text: "Tomorrow", tone: "soon" };
  return { text: fmtDateShort(due), tone: diff <= 7 ? "soon" : "later" };
}

export const DUE_TONE_CLASS: Record<ReturnType<typeof dueLabel>["tone"], string> = {
  late: "text-red-600 dark:text-red-400 font-semibold",
  today: "text-amber-600 dark:text-amber-400 font-semibold",
  soon: "text-foreground",
  later: "text-muted-foreground",
  none: "text-muted-foreground",
};

// ── Contact links (Call / WhatsApp) ───────────────────────────────────────

export function telHref(mobile: string): string | null {
  const m = normalizeIndianMobile(mobile || "");
  return m ? `tel:+91${m}` : null;
}

export function whatsappHref(mobile: string, text?: string): string | null {
  const m = normalizeIndianMobile(mobile || "");
  return m ? `https://wa.me/91${m}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
}
