/** Pure computation behind the utility rail's "Today's snapshot" — kept out of the component so
 *  the "due today" / "overdue" / "collected today" definitions are unit-testable and reuse the
 *  same daysLeft()/istDateString() the rest of the app already uses for due-date badges, instead
 *  of a second, possibly-inconsistent notion of "today". */
import { daysLeft } from "@/lib/business-rules";
import { istDateString } from "@/lib/ist-date";
import type { Order, OrderPayment, SalesPayment } from "@/lib/types";

export interface DueTodayOrder {
  id: string;
  name: string;
  balance: number;
}

export interface TodaySnapshot {
  /** Orders whose delivery date is today and that haven't been delivered/paid off yet. */
  dueToday: DueTodayOrder[];
  /** Orders with an outstanding balance whose delivery date is today or already past. */
  pendingCount: number;
  pendingTotal: number;
  /** Sum of stitching-order + sales payments recorded today. */
  collectedToday: number;
}

export function computeTodaySnapshot(orders: Order[], orderPayments: OrderPayment[], salesPayments: SalesPayment[]): TodaySnapshot {
  const dueToday: DueTodayOrder[] = [];
  let pendingCount = 0;
  let pendingTotal = 0;

  for (const o of orders) {
    if (o.status === "delivered" || o.status === "payment" || !o.deliveryDate) continue;
    const d = daysLeft(o.deliveryDate);
    if (d === 0) dueToday.push({ id: o.id, name: o.name, balance: o.balance });
    if (d <= 0 && o.balance > 0) {
      pendingCount++;
      pendingTotal += o.balance;
    }
  }

  const today = istDateString();
  const collectedToday =
    orderPayments.filter((p) => istDateString(new Date(p.createdAt)) === today).reduce((s, p) => s + p.amount, 0) +
    salesPayments.filter((p) => istDateString(new Date(p.date)) === today).reduce((s, p) => s + p.amount, 0);

  return { dueToday, pendingCount, pendingTotal, collectedToday };
}
