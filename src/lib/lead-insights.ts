import { istDateString } from "@/lib/ist-date";
import { isOpenStage, LEAD_STAGES, type LeadStage } from "@/lib/lead-stages";

/** Small pure helpers behind the lead screens: how long a lead has gone quiet, whether it needs attention, what comes next. */

const dayNumber = (isoDay: string): number => {
  const [y, m, d] = isoDay.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Whole shop-local (IST) days from `timestamp` to `today` (yyyy-mm-dd). Never negative. */
export function daysSince(timestamp: string, today: string): number {
  if (!timestamp || !today) return 0;
  const then = new Date(timestamp);
  if (Number.isNaN(then.getTime())) return 0;
  return Math.max(0, dayNumber(today) - dayNumber(istDateString(then)));
}

/** A lead goes amber after this many quiet days, red after the second. */
export const QUIET_AMBER_DAYS = 3;
export const QUIET_RED_DAYS = 7;

export type QuietLevel = "none" | "amber" | "red";

export function quietLevel(days: number): QuietLevel {
  return days >= QUIET_RED_DAYS ? "red" : days >= QUIET_AMBER_DAYS ? "amber" : "none";
}

interface LeadLike {
  stage: string;
  updatedAt: string;
  nextFollowUp?: { dueDate: string | null } | null;
}

/** Days with no activity on an OPEN lead (the lead's updated-at moves on every note, call, file and stage change); 0 for won/lost. */
export function daysQuiet(lead: Pick<LeadLike, "stage" | "updatedAt">, today: string): number {
  return isOpenStage(lead.stage) ? daysSince(lead.updatedAt, today) : 0;
}

/** True when an open lead has been quiet for a few days, or its next follow-up is already overdue. */
export function needsAttention(lead: LeadLike, today: string): boolean {
  if (!isOpenStage(lead.stage)) return false;
  if (quietLevel(daysQuiet(lead, today)) !== "none") return true;
  const due = lead.nextFollowUp?.dueDate;
  return !!due && due < today;
}

/** The stage a lead moves to with one tap: New → Talking → Visit → Quoted → Won. Null once decided. */
export function nextStage(stage: string): LeadStage | null {
  const i = LEAD_STAGES.indexOf(stage as LeadStage);
  if (i < 0) return null;
  const next = LEAD_STAGES[i + 1];
  // "lost" is a decision, never the next step along.
  return next && next !== "lost" ? next : null;
}

/** "Today", "Tomorrow", "In 3 days" style date, shop-local, counted from `today`. */
export function addDays(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "just now", "5m ago", "3h ago", "2d ago", "3w ago" — a short relative time for list cards. */
export function timeAgo(timestamp: string, now: number = Date.now()): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.floor((now - then) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export const ACTIVITY_LABEL: Record<string, string> = { note: "Note", call: "Call", meeting: "Meeting", whatsapp: "WhatsApp chat", stage_change: "Stage change" };
