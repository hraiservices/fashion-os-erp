import { describe, expect, it } from "vitest";
import type { BriefingSummary } from "@/lib/ai-briefing";
import { buildNeedsMe } from "@/lib/needs-me";

const base: BriefingSummary = {
  overdueOrders: { count: 0, balance: 0 },
  overdueInvoices: { count: 0, balance: 0 },
  newOrdersToday: 0,
  newInvoicesToday: 0,
  collectedToday: 0,
  lowStockCount: 0,
  ordersAtRisk: 0,
  leadFollowUpsDue: 0,
  quietLeads: 0,
  newLeadsToday: 0,
  date: "2026-10-18",
};

describe("buildNeedsMe", () => {
  it("is empty when nothing needs attention", () => {
    expect(buildNeedsMe(base, 0, true)).toEqual([]);
  });
  it("puts risk and money first, in that order", () => {
    const items = buildNeedsMe({ ...base, ordersAtRisk: 2, overdueOrders: { count: 1, balance: 4000 }, quietLeads: 3, lowStockCount: 1 }, 1, true);
    expect(items.map((i) => i.key)).toEqual(["risk", "money", "pickup", "quiet", "stock"]);
    expect(items[1].label).toContain("₹4,000");
  });
  it("hides lead lines without Targets access", () => {
    const items = buildNeedsMe({ ...base, leadFollowUpsDue: 2, quietLeads: 1, newLeadsToday: 1 }, 0, false);
    expect(items).toEqual([]);
  });
  it("uses singular wording for one", () => {
    expect(buildNeedsMe({ ...base, ordersAtRisk: 1 }, 0, true)[0].label).toBe("1 order may miss the delivery date");
  });
});
