import { Inbox, Scissors, Shirt, CheckCircle2, Truck, IndianRupee, type LucideIcon } from "lucide-react";
import type { Stage } from "@/lib/business-rules";

/**
 * Presentation layer for order stages. The old app used raw emoji + inline hex colors;
 * this maps each stage to a Lucide icon and a Tailwind class set so stage styling is
 * consistent everywhere and adapts to light/dark. Business meaning is unchanged —
 * STAGE_META in business-rules.ts remains the source of truth for labels/order.
 */
export interface StageStyle {
  icon: LucideIcon;
  /** Solid pill (badges). */
  badge: string;
  /** Subtle tinted surface (column headers, card accents). */
  surface: string;
  /** Border / accent-bar color. */
  accent: string;
  /** Solid button background for the "advance" action. */
  solid: string;
}

export const STAGE_STYLE: Record<Stage, StageStyle> = {
  received: {
    icon: Inbox,
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    surface: "bg-slate-50 dark:bg-slate-900/40",
    accent: "bg-slate-400",
    solid: "bg-slate-700 text-white hover:bg-slate-800",
  },
  cutting: {
    icon: Scissors,
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    surface: "bg-amber-50 dark:bg-amber-950/30",
    accent: "bg-amber-400",
    solid: "bg-amber-600 text-white hover:bg-amber-700",
  },
  stitching: {
    icon: Shirt,
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    surface: "bg-violet-50 dark:bg-violet-950/30",
    accent: "bg-violet-400",
    solid: "bg-violet-600 text-white hover:bg-violet-700",
  },
  ready: {
    icon: CheckCircle2,
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    surface: "bg-emerald-50 dark:bg-emerald-950/30",
    accent: "bg-emerald-400",
    solid: "bg-emerald-600 text-white hover:bg-emerald-700",
  },
  delivered: {
    icon: Truck,
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
    surface: "bg-cyan-50 dark:bg-cyan-950/30",
    accent: "bg-cyan-400",
    solid: "bg-cyan-600 text-white hover:bg-cyan-700",
  },
  payment: {
    icon: IndianRupee,
    badge: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    surface: "bg-green-50 dark:bg-green-950/30",
    accent: "bg-green-500",
    solid: "bg-green-600 text-white hover:bg-green-700",
  },
};

/** Urgency styling for the due-date badge (dueBadge() decides *what* to show; this decides how). */
export const DUE_STYLE = {
  overdue: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  today: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  soon: "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300",
  normal: "bg-muted text-muted-foreground",
} as const;

export function dueStyleFor(text: string, urgent: boolean): string {
  if (text.includes("OVERDUE")) return DUE_STYLE.overdue;
  if (urgent) return DUE_STYLE.today;
  if (text.includes("tmr")) return DUE_STYLE.soon;
  return DUE_STYLE.normal;
}
