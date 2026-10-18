import { stageLabel } from "@/lib/lead-stages";

/** A plain one-line read of a lead for the top of its page: stage, what they want, budget, deadline. Pure — works with AI off. */

export interface OneLinerLead {
  stage: string;
  outfitType: string;
  pieces: number;
  productInterest: string;
  budgetMin: number;
  budgetMax: number;
  neededBy: string | null;
  expectedValue: number;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function leadOneLiner(lead: OneLinerLead, today: string, heat?: string | null): string {
  const bits: string[] = [];
  bits.push(heat && heat !== "none" ? `${heat[0].toUpperCase()}${heat.slice(1)} ${stageLabel(lead.stage).toLowerCase()} lead` : `${stageLabel(lead.stage)} lead`);
  const what = lead.outfitType || lead.productInterest;
  if (what) bits.push(`${what}${lead.pieces > 1 ? ` × ${lead.pieces}` : ""}`);
  if (lead.budgetMin > 0 && lead.budgetMax > 0) bits.push(`${inr(lead.budgetMin)}–${inr(lead.budgetMax)}`);
  else if (lead.budgetMax > 0) bits.push(`up to ${inr(lead.budgetMax)}`);
  else if (lead.expectedValue > 0) bits.push(`about ${inr(lead.expectedValue)}`);
  if (lead.neededBy) {
    const d = dayDiff(today, lead.neededBy);
    bits.push(d < 0 ? `needed ${-d} days ago` : d === 0 ? "needed today" : d === 1 ? "needed tomorrow" : `needed in ${d} days`);
  }
  return bits.join(" · ");
}
