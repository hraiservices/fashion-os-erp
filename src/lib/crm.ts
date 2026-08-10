import type { Order, Customer } from "@/lib/types";
import type { Json } from "@/lib/supabase/database.types";

export interface CustomerProfile {
  name: string;
  mobile: string;
  email: string;
  dob: string;
  anniversary: string;
  address: string;
  orders: Order[];
  spent: number;
  measurements: Record<string, Json>;
  notes: string;
  custId?: string;
  loyaltyPoints: number;
  totalEarned: number;
  loyaltyHistory: Json[];
  paymentTerms: string;
  priceListId: string | null;
  tags: string[];
  gstin: string;
}

/**
 * byMob merge, Stitching_Manager_Pro_v16.html ~line 6763-6797. Orders are the primary
 * source of customers (so a customer with orders but no `customers` row still shows up);
 * the `customers` table only supplies measurements/notes/loyalty on top.
 */
export function buildCustomerMap(orders: Order[], customers: Customer[]): CustomerProfile[] {
  const m: Record<string, CustomerProfile> = {};

  const BLANK_PROFILE = (name: string, mobile: string): CustomerProfile => ({
    name, mobile, email: "", dob: "", anniversary: "", address: "",
    orders: [], spent: 0, measurements: {}, notes: "",
    loyaltyPoints: 0, totalEarned: 0, loyaltyHistory: [], paymentTerms: "due_on_receipt", priceListId: null, tags: [], gstin: "",
  });

  orders.forEach((o) => {
    m[o.mobile] = m[o.mobile] || BLANK_PROFILE(o.name, o.mobile);
    m[o.mobile].orders.push(o);
    m[o.mobile].spent += o.total || 0;
  });

  customers.forEach((c) => {
    if (!m[c.mobile]) m[c.mobile] = BLANK_PROFILE(c.name, c.mobile);
    m[c.mobile].email = c.email || "";
    m[c.mobile].dob = c.dob || "";
    m[c.mobile].anniversary = c.anniversary || "";
    m[c.mobile].address = c.address || "";
    m[c.mobile].measurements = c.measurements || {};
    m[c.mobile].notes = c.notes || "";
    m[c.mobile].custId = c.id;
    m[c.mobile].loyaltyPoints = c.loyaltyPoints || 0;
    m[c.mobile].totalEarned = c.totalEarned || 0;
    m[c.mobile].loyaltyHistory = c.loyaltyHistory || [];
    m[c.mobile].paymentTerms = c.paymentTerms || "due_on_receipt";
    m[c.mobile].priceListId = c.priceListId;
    m[c.mobile].tags = c.tags || [];
    m[c.mobile].gstin = c.gstin || "";
  });

  return Object.values(m).sort((a, b) => {
    const bDate = b.orders[0]?.inDate;
    const aDate = a.orders[0]?.inDate;
    return new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime();
  });
}

export interface LoyaltyHistoryEntry {
  date: string;
  type: "earn" | "delivery" | "manual" | "payment_bonus" | "redeem" | string;
  pts: number;
  orderId: string | null;
  note: string;
}

export const LOYALTY_TYPE_LABELS: Record<string, string> = {
  earn: "Earned",
  delivery: "Delivery bonus",
  manual: "Manual bonus",
  payment_bonus: "Payment bonus",
  redeem: "Redeemed",
};
