import type { Order } from "@/lib/types";

/** Who is actually stitching: the distinct tailors on the garments, falling back to the order-level tailor. */
export function orderTailorIds(order: Pick<Order, "tailor" | "garments">): string[] {
  const ids = Array.from(new Set((order.garments || []).map((g) => g.tailor || "").filter(Boolean)));
  return ids.length ? ids : order.tailor ? [order.tailor] : [];
}

/** "Rahul", or "Rahul +1" when the garments are split across tailors; empty when nobody is assigned. */
export function orderTailorLabel(order: Pick<Order, "tailor" | "garments">, nameOf: (id: string) => string): string {
  const ids = orderTailorIds(order);
  if (ids.length === 0) return "";
  return `${nameOf(ids[0]) || ids[0]}${ids.length > 1 ? ` +${ids.length - 1}` : ""}`;
}
