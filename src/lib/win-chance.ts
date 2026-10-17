/**
 * "How likely is this lead to be won?" learned from the shop's own closed leads — no AI call. Each trait of a lead (source,
 * outfit, budget size, whether it has a deadline) is compared with how past leads with that trait ended, smoothed so a
 * trait seen only once or twice barely moves the answer. Needs enough closed leads to mean anything.
 */
export interface ClosedLead {
  stage: string;
  source: string;
  outfitType: string;
  budgetMax: number;
  expectedValue: number;
  neededBy: string | null;
}

export interface WinModel {
  closed: number;
  baseRate: number;
  traits: Map<string, { won: number; total: number }>;
}

export const MIN_CLOSED_LEADS = 20;

const budgetBand = (l: { budgetMax: number; expectedValue: number }) => {
  const v = l.budgetMax || l.expectedValue;
  if (!v) return "";
  return v < 5000 ? "budget:low" : v < 20000 ? "budget:mid" : "budget:high";
};

export function traitsOf(l: Omit<ClosedLead, "stage">): string[] {
  const t: string[] = [];
  if (l.source.trim()) t.push(`source:${l.source.trim().toLowerCase()}`);
  if (l.outfitType.trim()) t.push(`outfit:${l.outfitType.trim().toLowerCase()}`);
  const b = budgetBand(l);
  if (b) t.push(b);
  t.push(l.neededBy ? "deadline:yes" : "deadline:no");
  return t;
}

export function buildWinModel(closed: ClosedLead[]): WinModel {
  const done = closed.filter((l) => l.stage === "won" || l.stage === "lost");
  const traits = new Map<string, { won: number; total: number }>();
  for (const l of done) {
    for (const t of traitsOf(l)) {
      const cur = traits.get(t) ?? { won: 0, total: 0 };
      cur.total += 1;
      if (l.stage === "won") cur.won += 1;
      traits.set(t, cur);
    }
  }
  const won = done.filter((l) => l.stage === "won").length;
  return { closed: done.length, baseRate: done.length ? won / done.length : 0, traits };
}

/** Percent chance (5–95), or null while there are too few closed leads to say. */
export function winChance(model: WinModel, lead: Omit<ClosedLead, "stage">): { pct: number; basis: number } | null {
  if (model.closed < MIN_CLOSED_LEADS) return null;
  const K = 5; // prior strength: a trait needs ~5 past leads before it counts as much as the overall win rate
  const shifts = traitsOf(lead)
    .map((t) => model.traits.get(t))
    .filter((s): s is { won: number; total: number } => !!s)
    .map((s) => (s.won + K * model.baseRate) / (s.total + K) - model.baseRate);
  const avgShift = shifts.length ? shifts.reduce((a, b) => a + b, 0) / shifts.length : 0;
  const p = Math.min(0.95, Math.max(0.05, model.baseRate + avgShift * 1.5));
  return { pct: Math.round(p * 100), basis: model.closed };
}
