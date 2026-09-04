import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { STAGES, type Stage } from "@/lib/business-rules";

export interface PublicOrderStatusGarment {
  type: string;
  no: number | null;
  amount: number | null;
}

export interface PublicOrderStatusOrder {
  id: string;
  deliveryDate: string;
  total: number;
  advance: number;
  balance: number;
  status: Stage;
  special: string;
  history: string[];
  images: string[];
  reworkFlag: boolean;
  reworkReason: string;
  garments: PublicOrderStatusGarment[];
}

export interface PublicCustomerOrderStatus {
  customerName: string;
  loyaltyPoints: number;
  measurements: Record<string, Json>;
  orders: PublicOrderStatusOrder[];
  shopName: string;
  shopPhone: string;
}

interface RawPublicOrderStatusOrder extends Omit<PublicOrderStatusOrder, "status"> {
  status: string;
}

interface GetCustomerOrderStatusResult {
  customerName: string;
  loyaltyPoints: number;
  measurements: Record<string, Json> | null;
  orders: RawPublicOrderStatusOrder[] | null;
  shopName: string;
  shopPhone: string;
}

/** Calls the security-definer `get_customer_order_status` RPC — the only anon-reachable entry
 *  point for a customer's order-status link. Returns null for an unknown/revoked token, same
 *  as fetchPublicInvoice. */
export async function fetchPublicOrderStatus(supabase: SupabaseClient<Database>, token: string): Promise<PublicCustomerOrderStatus | null> {
  const { data, error } = await supabase.rpc("get_customer_order_status", { p_token: token });
  if (error || !data) return null;

  const result = data as unknown as GetCustomerOrderStatusResult;
  return {
    customerName: result.customerName || "",
    loyaltyPoints: result.loyaltyPoints || 0,
    measurements: result.measurements || {},
    // Same defensive fallback as mapOrderRow: legacy "trial" folds into "ready", anything
    // else unrecognised falls back to "received" rather than throwing on an unknown
    // STAGE_META lookup and white-screening this public page.
    orders: (result.orders || []).map((o) => ({
      ...o,
      status: (o.status === "trial" ? "ready" : STAGES.includes(o.status as Stage) ? (o.status as Stage) : "received") as Stage,
    })),
    shopName: result.shopName || "",
    shopPhone: result.shopPhone || "",
  };
}

export interface ParsedHistoryEntry {
  emoji: string;
  label: string;
  when: string;
}

/** Turns an internal history line — `${emoji} ${label} — ${fmtNow()} by ${userName}`, with
 *  optional trailing ` · ...` staff-facing badges (payment method, loyalty points applied) —
 *  into what a customer should see: just the stage and when it happened. Staff attribution and
 *  the trailing badges are internal detail, not something a customer's status page shows. */
export function parseHistoryLine(line: string): ParsedHistoryEntry {
  const mainClause = line.split(" · ")[0];
  const withoutAttribution = mainClause.replace(/ by .+$/, "");
  const dashIdx = withoutAttribution.indexOf(" — ");
  const stagePart = dashIdx >= 0 ? withoutAttribution.slice(0, dashIdx) : withoutAttribution;
  const when = dashIdx >= 0 ? withoutAttribution.slice(dashIdx + 3) : "";
  const spaceIdx = stagePart.indexOf(" ");
  return {
    emoji: spaceIdx >= 0 ? stagePart.slice(0, spaceIdx) : "",
    label: spaceIdx >= 0 ? stagePart.slice(spaceIdx + 1) : stagePart,
    when,
  };
}
