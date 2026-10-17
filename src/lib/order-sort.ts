import { daysLeft } from "@/lib/business-rules";

export type DueSort = "none" | "asc" | "desc";

/** Default → soonest due first → latest due first → back to default. */
export function nextDueSort(current: DueSort): DueSort {
  return current === "none" ? "asc" : current === "asc" ? "desc" : "none";
}

/**
 * Orders sorted by days left until delivery. "asc" puts the most urgent (smallest / most overdue) first,
 * "desc" the furthest-out first. Orders with no delivery date always sink to the bottom in both directions,
 * and ties keep their incoming order. "none" returns the list untouched.
 */
export function sortOrdersByDue<T extends { deliveryDate: string }>(orders: T[], sort: DueSort): T[] {
  if (sort === "none") return orders;
  const sign = sort === "asc" ? 1 : -1;
  return orders
    .map((o, i) => ({ o, i, d: o.deliveryDate ? daysLeft(o.deliveryDate) : null }))
    .sort((a, b) => {
      if (a.d === null && b.d === null) return a.i - b.i;
      if (a.d === null) return 1;
      if (b.d === null) return -1;
      return (a.d - b.d) * sign || a.i - b.i;
    })
    .map((x) => x.o);
}
