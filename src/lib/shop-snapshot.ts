import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { istDateString } from "@/lib/ist-date";
import { addDaysIso } from "@/lib/work-tasks";

/** A small, factual picture of what the shop has been selling — the data AI planners are given, so they never have to guess. Server only. */

export interface ShopSnapshot {
  today: string;
  windowDays: number;
  ordersInWindow: number;
  topGarments: { type: string; count: number }[];
  topProducts: { name: string; qty: number }[];
  /** Same garment counts for the matching window one year ago — shows the seasonal pattern. */
  lastYearTopGarments: { type: string; count: number }[];
}

const tally = (items: string[]) => {
  const m = new Map<string, number>();
  for (const i of items) if (i) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 8);
};

const garmentTypesOf = (rows: { garments: unknown }[]) => rows.flatMap((o) => (Array.isArray(o.garments) ? o.garments.map((g) => String((g as { type?: string })?.type ?? "")) : []));

export async function buildShopSnapshot(serviceClient: SupabaseClient<Database>, windowDays = 90): Promise<ShopSnapshot> {
  const today = istDateString();
  const from = addDaysIso(today, -windowDays);
  const lyFrom = addDaysIso(today, -365 - Math.round(windowDays / 3));
  const lyTo = addDaysIso(today, -365 + Math.round((windowDays * 2) / 3));
  const [recent, lastYear, invoices] = await Promise.all([
    serviceClient.from("orders").select("garments").gte("in_date", from).limit(3000),
    serviceClient.from("orders").select("garments").gte("in_date", lyFrom).lte("in_date", lyTo).limit(3000),
    serviceClient.from("sales_invoices").select("items").gte("invoice_date", from).neq("doc_status", "draft").limit(2000),
  ]);
  const productQty = new Map<string, number>();
  for (const inv of invoices.data || []) {
    if (!Array.isArray(inv.items)) continue;
    for (const it of inv.items as { productName?: string; qty?: number }[]) {
      if (it?.productName) productQty.set(it.productName, (productQty.get(it.productName) ?? 0) + (Number(it.qty) || 1));
    }
  }
  return {
    today,
    windowDays,
    ordersInWindow: (recent.data || []).length,
    topGarments: tally(garmentTypesOf(recent.data || [])),
    topProducts: [...productQty].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8),
    lastYearTopGarments: tally(garmentTypesOf(lastYear.data || [])),
  };
}
