/** Regular customers who are due another order, judged from their own rhythm (how often they usually order). Pure. */

export interface ReorderOrder {
  name: string;
  mobile: string;
  in_date: string;
  garments: unknown;
}

export interface ReorderCandidate {
  name: string;
  mobile: string;
  lastOrder: string;
  /** Their usual gap between occasions, in days. */
  usualGapDays: number;
  daysSince: number;
  lastGarment: string;
  orderCount: number;
}

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Orders placed within this many days of each other count as one occasion (a family booking in several visits). */
const SAME_OCCASION_DAYS = 14;
const MIN_GAP = 45;
const MAX_GAP = 400;

export function reorderCandidates(orders: ReorderOrder[], today: string, openLeadMobiles: Set<string> = new Set()): ReorderCandidate[] {
  const by = new Map<string, ReorderOrder[]>();
  for (const o of orders) {
    const mobile = (o.mobile || "").replace(/\D/g, "").slice(-10);
    if (mobile.length < 10 || !o.in_date) continue;
    by.set(mobile, [...(by.get(mobile) ?? []), { ...o, mobile }]);
  }
  const out: ReorderCandidate[] = [];
  for (const [mobile, list] of by) {
    if (openLeadMobiles.has(mobile)) continue;
    list.sort((a, b) => a.in_date.localeCompare(b.in_date));
    // Collapse into occasions.
    const occasions: ReorderOrder[] = [];
    for (const o of list) {
      const prev = occasions[occasions.length - 1];
      if (prev && dayNum(o.in_date) - dayNum(prev.in_date) < SAME_OCCASION_DAYS) occasions[occasions.length - 1] = o;
      else occasions.push(o);
    }
    if (occasions.length < 3) continue; // two orders is not yet a rhythm
    const gaps = occasions.slice(1).map((o, i) => dayNum(o.in_date) - dayNum(occasions[i].in_date));
    const usual = Math.min(MAX_GAP, Math.max(MIN_GAP, Math.round(median(gaps))));
    const last = occasions[occasions.length - 1];
    const daysSince = Math.round(dayNum(today) - dayNum(last.in_date));
    // Due from 90% of their usual gap until twice the gap (after that they have probably moved on).
    if (daysSince < usual * 0.9 || daysSince > usual * 2) continue;
    const types = Array.isArray(last.garments) ? [...new Set(last.garments.map((g) => String((g as { type?: string })?.type ?? "").trim()).filter(Boolean))] : [];
    out.push({ name: last.name, mobile, lastOrder: last.in_date, usualGapDays: usual, daysSince, lastGarment: types[0] ?? "", orderCount: list.length });
  }
  return out.sort((a, b) => b.daysSince / b.usualGapDays - a.daysSince / a.usualGapDays).slice(0, 15);
}

export function reorderMessage(): string {
  return "Hi {name}! It's been a little while since your {garment} — hope you're loving it. Planning anything new? We'd be happy to stitch something for your next occasion 😊";
}

/** Fills {name} and {garment}; without a known garment the phrase falls back to "your last outfit". */
export function fillReorder(template: string, c: Pick<ReorderCandidate, "name" | "lastGarment">): string {
  const first = c.name.trim().split(/\s+/)[0] || "there";
  const garment = c.lastGarment ? c.lastGarment.toLowerCase() : "last outfit";
  return template.replaceAll("{name}", first).replaceAll("{garment}", garment);
}
