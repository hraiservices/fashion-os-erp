// Purchases business logic — Vendors, Purchase Orders, Bills, Vendor Payments, Vendor Credits.

import { istDateString } from "@/lib/ist-date";

export type PurchaseItemType = "raw_material" | "product";

/**
 * A line can reference either a raw material (the common case — buying fabric/trims to
 * manufacture from) or a finished product (buying ready-made goods to resell directly).
 * `rawMaterialId`/`rawMaterialName` are kept as the field names for the raw-material case
 * for backward compatibility with bills/POs saved before products were supported here —
 * `itemType` is optional and absent on those old records, defaulting to "raw_material".
 */
export interface PurchaseLineItem {
  itemType?: PurchaseItemType;
  rawMaterialId?: string;
  rawMaterialName?: string;
  productId?: string;
  productName?: string;
  unitName: string;
  qty: number;
  unitCost: number;
  amount: number;
}

export function purchaseItemType(item: PurchaseLineItem): PurchaseItemType {
  return item.itemType || (item.productId ? "product" : "raw_material");
}

/** The raw_material_id or product_id this line actually points at, whichever applies. */
export function purchaseItemId(item: PurchaseLineItem): string {
  return purchaseItemType(item) === "product" ? item.productId || "" : item.rawMaterialId || "";
}

export function purchaseItemName(item: PurchaseLineItem): string {
  return purchaseItemType(item) === "product" ? item.productName || "Unknown" : item.rawMaterialName || "Unknown";
}

/** Same change, and for the same reasons, as sales.ts's genNumber — `purchase_orders.po_number`
 *  and `purchase_bills.bill_number` are UNIQUE too, and 900 numbers a day was not enough. */
function genNumber(prefix: string): string {
  const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `${prefix}-${istDateString().replace(/-/g, "")}-${rand}`;
}

export const genPoNumber = () => genNumber("PO");
export const genBillNumber = () => genNumber("BILL");
export const genCreditNumber = () => genNumber("VC");

export function computeLineItemsTotal(items: PurchaseLineItem[]): number {
  return items.reduce((s, i) => s + (i.amount || 0), 0);
}

/** A bill's / PO's grand total: the items plus GST on them, then shipping and other charges added on top. The charges
 *  carry no GST — they are added after tax — so GST reports and the taxable amount are unaffected by them. */
export function computePurchaseTotal(totalWithGst: number, shippingCharges: number, otherCharges: number): number {
  const sum = (totalWithGst || 0) + Math.max(0, shippingCharges || 0) + Math.max(0, otherCharges || 0);
  return Math.round(sum * 100) / 100;
}

export type PoStatus = "draft" | "sent" | "received" | "cancelled";
export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: "Draft",
  sent: "Sent to vendor",
  received: "Received",
  cancelled: "Cancelled",
};

export type BillPaymentStatus = "unpaid" | "partial" | "paid";

/**
 * A bill's payable amount is always derived — never a stored/cached column — same rule as
 * order balances and inventory stock. Vendor credits against this bill (returns) reduce the
 * amount owed before payments are applied; a credit only ever targets one specific bill
 * (per the "return to vendor and reduce the bill" decision — no floating/unlinked credits).
 */
export function deriveBillBalance(billTotal: number, creditsTotal: number, paymentsTotal: number): number {
  const effectiveTotal = Math.max(0, (billTotal || 0) - (creditsTotal || 0));
  return Math.max(0, effectiveTotal - (paymentsTotal || 0));
}

export function billPaymentStatus(billTotal: number, creditsTotal: number, paymentsTotal: number): BillPaymentStatus {
  const balance = deriveBillBalance(billTotal, creditsTotal, paymentsTotal);
  const effectiveTotal = Math.max(0, (billTotal || 0) - (creditsTotal || 0));
  if (balance <= 0) return "paid";
  if (balance < effectiveTotal) return "partial";
  return "unpaid";
}

/** Average days from bill date to the payment that fully settled it — fully-paid bills only, mirrors lib/sales.ts avgDaysToGetPaid. */
export function avgDaysToPayVendor(bills: { paymentStatus: BillPaymentStatus; billDate: string; lastPaymentDate: string | null }[]): number | null {
  const settled = bills.filter((b) => b.paymentStatus === "paid" && b.lastPaymentDate);
  if (!settled.length) return null;
  const totalDays = settled.reduce((s, b) => s + Math.max(0, (new Date(b.lastPaymentDate!).getTime() - new Date(b.billDate).getTime()) / 86_400_000), 0);
  return Math.round(totalDays / settled.length);
}

export const BILL_STATUS_LABELS: Record<BillPaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partially paid",
  paid: "Paid",
};
