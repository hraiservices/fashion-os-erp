/** Who to chase for money today: customers with something outstanding, ranked by how much and how late. Pure. */

export interface DueOrder {
  id: string;
  name: string;
  mobile: string;
  status: string;
  balance: number;
  deliveryDate: string;
}
export interface DueInvoice {
  invoiceNumber: string;
  customerName: string;
  customerMobile: string;
  balance: number;
  dueDate: string | null;
  invoiceDate: string;
  docStatus: string;
}

export interface CollectionRow {
  mobile: string;
  name: string;
  amount: number;
  daysLate: number;
  /** What is owed, in words ("order A12, invoice INV-004"). */
  refs: string[];
  /** Number of orders the customer has placed in total — loyal customers get a gentler tone. */
  orderCount: number;
  tone: "gentle" | "friendly" | "firm";
}

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Stitching orders only count once the garment is ready or handed over; invoices once past due. */
const BILLABLE_ORDER_STATUSES = new Set(["ready", "delivered", "payment"]);

export function toneFor(daysLate: number, orderCount: number): CollectionRow["tone"] {
  if (daysLate > 30) return "firm";
  if (daysLate > 7 && orderCount < 3) return "firm";
  if (daysLate > 7) return "friendly";
  return orderCount >= 3 ? "gentle" : "friendly";
}

export function buildCollections(orders: (DueOrder & { id: string })[], invoices: DueInvoice[], today: string): CollectionRow[] {
  const orderCounts = new Map<string, number>();
  for (const o of orders) orderCounts.set(o.mobile, (orderCounts.get(o.mobile) ?? 0) + 1);
  const rows = new Map<string, CollectionRow>();
  const add = (mobile: string, name: string, amount: number, late: number, ref: string) => {
    if (!mobile || amount <= 0) return;
    const cur = rows.get(mobile) ?? { mobile, name, amount: 0, daysLate: 0, refs: [], orderCount: orderCounts.get(mobile) ?? 0, tone: "gentle" as const };
    cur.amount += amount;
    cur.daysLate = Math.max(cur.daysLate, late);
    cur.refs.push(ref);
    rows.set(mobile, cur);
  };
  for (const o of orders) if (o.balance > 0 && BILLABLE_ORDER_STATUSES.has(o.status)) add(o.mobile, o.name, o.balance, Math.max(0, dayDiff(o.deliveryDate, today)), `order ${o.id}`);
  for (const i of invoices) {
    if (i.docStatus === "draft" || i.balance <= 0) continue;
    const due = i.dueDate || i.invoiceDate;
    const late = dayDiff(due, today);
    if (late > 0) add(i.customerMobile, i.customerName, i.balance, late, `invoice ${i.invoiceNumber}`);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, tone: toneFor(r.daysLate, r.orderCount) }))
    .sort((a, b) => b.amount * (1 + b.daysLate / 30) - a.amount * (1 + a.daysLate / 30));
}

export function collectionMessage(row: Pick<CollectionRow, "name" | "amount" | "refs" | "tone">, shop: string, amountText: string): string {
  const first = row.name.trim().split(/\s+/)[0] || "there";
  const what = row.refs.slice(0, 2).join(" and ");
  if (row.tone === "firm") return `Hi ${first}, this is ${shop || "the shop"}. ${amountText} is still pending for ${what}. Please arrange the payment today, or let us know if there is a problem. Thank you.`;
  if (row.tone === "friendly") return `Hi ${first}! A gentle reminder from ${shop || "us"}: ${amountText} is pending for ${what}. Could you please pay at your earliest convenience? Thank you 🙏`;
  return `Hi ${first}! Thank you for being a valued customer of ${shop || "ours"} 🙏 Just a quick note that ${amountText} is pending for ${what}. Please pay when convenient.`;
}
