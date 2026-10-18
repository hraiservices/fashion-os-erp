import type { BriefingSummary } from "@/lib/ai-briefing";

/** One line on the dashboard's "What needs me today" card. Plain rules over numbers the shop already has — works with AI off. */
export interface NeedsMeItem {
  key: string;
  label: string;
  detail: string;
  href: string;
  level: "red" | "amber" | "blue";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const inr0 = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Ordered most urgent first. `canSeeLeads` hides the lead lines for someone without Targets access. */
export function buildNeedsMe(s: BriefingSummary, readyForPickup: number, canSeeLeads: boolean): NeedsMeItem[] {
  const items: NeedsMeItem[] = [];
  if (s.ordersAtRisk > 0) items.push({ key: "risk", label: `${plural(s.ordersAtRisk, "order")} may miss the delivery date`, detail: "Check these first", href: "/orders", level: "red" });
  if (s.overdueOrders.count > 0 || s.overdueInvoices.count > 0) {
    const count = s.overdueOrders.count + s.overdueInvoices.count;
    items.push({ key: "money", label: `${inr0(s.overdueOrders.balance + s.overdueInvoices.balance)} overdue from ${plural(count, "customer")}`, detail: "Send payment reminders", href: "/reports/collections", level: "red" });
  }
  if (readyForPickup > 0) items.push({ key: "pickup", label: `${plural(readyForPickup, "order")} ready — customers can collect`, detail: "Tell them it's ready", href: "/orders", level: "amber" });
  if (canSeeLeads && s.leadFollowUpsDue > 0) items.push({ key: "followups", label: `${plural(s.leadFollowUpsDue, "lead follow-up")} due today`, detail: "Open the Today tab", href: "/targets", level: "amber" });
  if (canSeeLeads && s.quietLeads > 0) items.push({ key: "quiet", label: `${plural(s.quietLeads, "lead")} gone quiet for a week`, detail: "A nudge may win them back", href: "/targets", level: "amber" });
  if (s.lowStockCount > 0) items.push({ key: "stock", label: `${plural(s.lowStockCount, "item")} low on stock`, detail: "Reorder before you run out", href: "/inventory", level: "amber" });
  if (canSeeLeads && s.newLeadsToday > 0) items.push({ key: "newleads", label: `${plural(s.newLeadsToday, "new lead")} today`, detail: "Say hello while they're warm", href: "/targets", level: "blue" });
  return items;
}
