import { isOpenStage } from "@/lib/lead-stages";

/**
 * How fast an enquiry gets picked up: whether it still has no owner, and how long it took someone to reply.
 * Pure — the lead's `firstResponseAt` is stamped server-side the first time staff log a call, note or message.
 */

/** An open lead with nobody's name on it is flagged once it is older than this. */
export const UNOWNED_ALERT_MINUTES = 15;

export interface ResponseLead {
  stage: string;
  assignedEmployeeId: string | null;
  createdAt: string;
  firstResponseAt?: string | null;
}

const MINUTE_MS = 60_000;

/** Minutes between two timestamps; null when either is missing or unreadable. */
export function minutesBetween(from: string, to: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / MINUTE_MS));
}

/** An open lead nobody owns, old enough that it should have been picked up by now. */
export function isUnowned(lead: ResponseLead, now: number = Date.now(), afterMinutes = UNOWNED_ALERT_MINUTES): boolean {
  if (lead.assignedEmployeeId || !isOpenStage(lead.stage)) return false;
  const created = Date.parse(lead.createdAt);
  if (Number.isNaN(created)) return false;
  return now - created >= afterMinutes * MINUTE_MS;
}

/** How long this lead waited for its first reply, in minutes. Null when nobody has replied yet. */
export function responseMinutes(lead: ResponseLead): number | null {
  return lead.firstResponseAt ? minutesBetween(lead.createdAt, lead.firstResponseAt) : null;
}

/** "12 min", "3 h 20 m", "2 days" — short enough for a chip. */
export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  if (mins < 24 * 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} h ${m} m` : `${h} h`;
  }
  const days = Math.round(mins / (24 * 60));
  return days === 1 ? "1 day" : `${days} days`;
}

export const SPEED_BUCKETS = [
  { key: "under15", label: "Under 15 min", max: 15 },
  { key: "under1h", label: "15 min – 1 hour", max: 60 },
  { key: "under4h", label: "1 – 4 hours", max: 240 },
  { key: "sameDay", label: "4 – 24 hours", max: 1440 },
  { key: "slow", label: "Over a day", max: Infinity },
] as const;

export type SpeedBucketKey = (typeof SPEED_BUCKETS)[number]["key"] | "noReply";

export function speedBucket(mins: number | null): SpeedBucketKey {
  if (mins === null) return "noReply";
  return SPEED_BUCKETS.find((b) => mins < b.max)?.key ?? "slow";
}

export interface SpeedRow {
  key: SpeedBucketKey;
  label: string;
  leads: number;
  won: number;
  winRatePct: number;
}

export interface OwnerResponseRow {
  employeeId: string | null;
  replied: number;
  noReply: number;
  medianMinutes: number | null;
  slowestMinutes: number | null;
}

interface StatLead extends ResponseLead {
  assignedEmployeeId: string | null;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Win rate by how fast the first reply went out — the number that makes the case for answering quickly. */
export function speedVsWinRate(leads: (StatLead & { stage: string })[]): SpeedRow[] {
  const counts = new Map<SpeedBucketKey, { leads: number; won: number }>();
  for (const l of leads) {
    // Only decided leads can show a win rate; open ones have not had their chance yet.
    if (l.stage !== "won" && l.stage !== "lost") continue;
    const key = speedBucket(responseMinutes(l));
    const cur = counts.get(key) ?? { leads: 0, won: 0 };
    cur.leads += 1;
    if (l.stage === "won") cur.won += 1;
    counts.set(key, cur);
  }
  const rows: SpeedRow[] = SPEED_BUCKETS.map((b) => {
    const c = counts.get(b.key) ?? { leads: 0, won: 0 };
    return { key: b.key, label: b.label, leads: c.leads, won: c.won, winRatePct: c.leads ? Math.round((c.won / c.leads) * 100) : 0 };
  });
  const none = counts.get("noReply") ?? { leads: 0, won: 0 };
  rows.push({ key: "noReply", label: "Never replied", leads: none.leads, won: none.won, winRatePct: none.leads ? Math.round((none.won / none.leads) * 100) : 0 });
  return rows.filter((r) => r.leads > 0);
}

/** Median and slowest first reply per salesperson. */
export function responseByOwner(leads: StatLead[]): OwnerResponseRow[] {
  const by = new Map<string, number[]>();
  const noReply = new Map<string, number>();
  for (const l of leads) {
    const key = l.assignedEmployeeId ?? "";
    const mins = responseMinutes(l);
    if (mins === null) noReply.set(key, (noReply.get(key) ?? 0) + 1);
    else by.set(key, [...(by.get(key) ?? []), mins]);
  }
  const keys = new Set([...by.keys(), ...noReply.keys()]);
  return [...keys]
    .map((k) => {
      const list = by.get(k) ?? [];
      return { employeeId: k || null, replied: list.length, noReply: noReply.get(k) ?? 0, medianMinutes: median(list), slowestMinutes: list.length ? Math.max(...list) : null };
    })
    .sort((a, b) => (a.medianMinutes ?? Infinity) - (b.medianMinutes ?? Infinity));
}
