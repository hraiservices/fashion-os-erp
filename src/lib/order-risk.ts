import { addDaysIso } from "@/lib/work-tasks";

/** Delivery-date risk for open orders — plain rules, no AI. A stage needs a minimum number of working days still ahead of it. */

/** Days a garment still needs once it reaches each stage (a rough shop rule of thumb). */
export const DAYS_NEEDED: Record<string, number> = { received: 6, cutting: 5, stitching: 3, finishing: 1, ready: 0 };

export interface RiskOrder {
  id: string;
  name: string;
  status: string;
  delivery_date: string;
}

export interface OrderRisk {
  id: string;
  name: string;
  status: string;
  deliveryDate: string;
  daysLeft: number;
  needed: number;
  level: "late" | "tight";
}

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Orders likely to miss their delivery date: already past it ("late"), or fewer days left than their stage still needs ("tight"). */
export function orderRisks(orders: RiskOrder[], today: string, horizonDays = 10): OrderRisk[] {
  const out: OrderRisk[] = [];
  for (const o of orders) {
    const needed = DAYS_NEEDED[o.status];
    if (needed === undefined || !o.delivery_date) continue; // delivered / paid orders are not at risk
    const daysLeft = dayDiff(today, o.delivery_date);
    if (daysLeft > horizonDays) continue;
    if (daysLeft < 0) out.push({ id: o.id, name: o.name, status: o.status, deliveryDate: o.delivery_date, daysLeft, needed, level: "late" });
    else if (daysLeft < needed) out.push({ id: o.id, name: o.name, status: o.status, deliveryDate: o.delivery_date, daysLeft, needed, level: "tight" });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export const earliestFinish = (today: string, daysNeeded: number) => addDaysIso(today, daysNeeded);
