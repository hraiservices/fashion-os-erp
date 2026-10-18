import { addDaysIso } from "@/lib/work-tasks";

/**
 * Tasks that come back: shop routines like "close the day book" or "count stock on Monday".
 * Pure. The rule is stored as a short string on the task; the repeat always lives on the LATEST
 * task of a chain (spawning the next one clears it from the old), so a routine can never fork.
 */

export type RepeatMode = "schedule" | "after_done";

export const REPEAT_MODE_LABELS: Record<RepeatMode, string> = {
  schedule: "On the schedule",
  after_done: "After I finish it",
};

/**
 * Rule format, kept short and readable in the column:
 *  - `daily`             every day
 *  - `weekly:1,3,5`      those weekdays (0 = Sunday … 6 = Saturday)
 *  - `monthly:5`         the 5th of each month
 *  - `days:14`           every 14 days
 */
export type RepeatRule = { kind: "daily" } | { kind: "weekly"; weekdays: number[] } | { kind: "monthly"; day: number } | { kind: "days"; n: number };

export function parseRepeatRule(raw: string | null | undefined): RepeatRule | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "daily") return { kind: "daily" };
  const [kind, arg = ""] = s.split(":");
  if (kind === "weekly") {
    const weekdays = [...new Set(arg.split(",").map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
    return weekdays.length ? { kind: "weekly", weekdays } : null;
  }
  if (kind === "monthly") {
    const day = parseInt(arg, 10);
    return Number.isInteger(day) && day >= 1 && day <= 31 ? { kind: "monthly", day } : null;
  }
  if (kind === "days") {
    const n = parseInt(arg, 10);
    return Number.isInteger(n) && n >= 1 && n <= 365 ? { kind: "days", n } : null;
  }
  return null;
}

export function formatRepeatRule(raw: string | null | undefined): string {
  const rule = parseRepeatRule(raw);
  if (!rule) return "";
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  switch (rule.kind) {
    case "daily":
      return "Every day";
    case "weekly":
      return `Every ${rule.weekdays.map((d) => names[d]).join(", ")}`;
    case "monthly":
      return `Every month on the ${rule.day}${rule.day === 1 ? "st" : rule.day === 2 ? "nd" : rule.day === 3 ? "rd" : "th"}`;
    case "days":
      return rule.n === 1 ? "Every day" : `Every ${rule.n} days`;
  }
}

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Adds months safely: 31 Jan + 1 month lands on 28/29 Feb, never 2 March. */
function monthlyAfter(from: string, day: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth();
  // The same month's date if it is still ahead, otherwise next month's.
  const thisMonth = Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  if (thisMonth > d.getUTCDate()) return `${year}-${String(month + 1).padStart(2, "0")}-${String(thisMonth).padStart(2, "0")}`;
  month += 1;
  if (month > 11) {
    month = 0;
    year += 1;
  }
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** The next date this routine falls due, strictly after `from`. Null when the rule can't be read. */
export function nextDueDate(raw: string | null | undefined, from: string): string | null {
  const rule = parseRepeatRule(raw);
  if (!rule || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  switch (rule.kind) {
    case "daily":
      return addDaysIso(from, 1);
    case "days":
      return addDaysIso(from, rule.n);
    case "monthly":
      return monthlyAfter(from, rule.day);
    case "weekly": {
      for (let i = 1; i <= 7; i++) {
        const d = addDaysIso(from, i);
        if (rule.weekdays.includes(weekdayOf(d))) return d;
      }
      return null;
    }
  }
}

/**
 * For a routine on a fixed schedule that has fallen behind: the first due date that is still
 * ahead of today, so a shop coming back from a holiday gets one task, not fourteen.
 */
export function catchUpDueDate(raw: string | null | undefined, lastDue: string, today: string): string | null {
  let next = nextDueDate(raw, lastDue);
  for (let guard = 0; next && next < today && guard < 400; guard++) next = nextDueDate(raw, next);
  return next;
}

// ── Presets for the task form ─────────────────────────────────────────────

/** The choices offered on the form. The weekday / day of month come from the task's own due date, which is what people expect from "repeats weekly". */
export const REPEAT_PRESETS = [
  { value: "", label: "Never" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
] as const;

export type RepeatPreset = (typeof REPEAT_PRESETS)[number]["value"];

/** Turns a form choice plus the due date into a stored rule. Empty when the choice needs a due date it hasn't got. */
export function ruleForPreset(preset: string, dueDate: string | null | undefined): string {
  if (!preset) return "";
  if (preset === "daily") return "daily";
  if (preset === "fortnightly") return "days:14";
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return "";
  if (preset === "weekly") return `weekly:${new Date(`${dueDate}T00:00:00Z`).getUTCDay()}`;
  if (preset === "monthly") return `monthly:${Number(dueDate.slice(8, 10))}`;
  return "";
}

/** Which form choice a stored rule came from, so an existing routine shows the right option. */
export function presetOfRule(raw: string | null | undefined): RepeatPreset {
  const rule = parseRepeatRule(raw);
  if (!rule) return "";
  if (rule.kind === "daily") return "daily";
  if (rule.kind === "weekly") return "weekly";
  if (rule.kind === "monthly") return "monthly";
  return rule.n === 14 ? "fortnightly" : "daily";
}
