import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export interface BriefingSummary {
  overdueOrders: { count: number; balance: number };
  overdueInvoices: { count: number; balance: number };
  newOrdersToday: number;
  newInvoicesToday: number;
  collectedToday: number;
  lowStockCount: number;
  date: string;
}

/**
 * Read-only aggregation for the daily AI briefing — reuses the existing v_chatbot_orders/
 * v_chatbot_invoices views (built for the AI Copilot) rather than re-deriving the same
 * overdue/balance logic a second time. Runs with the service-role client since the cron
 * route that calls this has no logged-in session.
 */
export async function buildBriefingSummary(supabase: SupabaseClient<Database>): Promise<BriefingSummary> {
  const today = new Date().toISOString().slice(0, 10);

  const [ordersRes, invoicesRes, paymentsTodayRes, rawMaterialsRes, productsRes, ledgerRes] = await Promise.all([
    supabase.from("v_chatbot_orders").select("balance, is_overdue, created_at"),
    supabase.from("v_chatbot_invoices").select("balance, is_overdue, created_at"),
    supabase.from("sales_payments").select("amount").eq("date", today),
    supabase.from("raw_materials").select("id, low_stock_alert"),
    supabase.from("products").select("id, low_stock_alert"),
    supabase.from("inventory_ledger").select("item_type, item_id, movement"),
  ]);

  const orders = ordersRes.data || [];
  const invoices = invoicesRes.data || [];
  const overdueOrders = orders.filter((o) => o.is_overdue);
  const overdueInvoices = invoices.filter((i) => i.is_overdue);
  const newOrdersToday = orders.filter((o) => (o.created_at || "").slice(0, 10) === today).length;
  const newInvoicesToday = invoices.filter((i) => (i.created_at || "").slice(0, 10) === today).length;
  const collectedToday = (paymentsTodayRes.data || []).reduce((s, p) => s + (p.amount || 0), 0);

  const stockByItem = new Map<string, number>();
  (ledgerRes.data || []).forEach((row) => {
    const key = `${row.item_type}:${row.item_id}`;
    stockByItem.set(key, (stockByItem.get(key) || 0) + (row.movement || 0));
  });
  const lowRawMaterials = (rawMaterialsRes.data || []).filter((m) => m.low_stock_alert > 0 && (stockByItem.get(`raw_material:${m.id}`) || 0) <= m.low_stock_alert).length;
  const lowProducts = (productsRes.data || []).filter((p) => p.low_stock_alert > 0 && (stockByItem.get(`product:${p.id}`) || 0) <= p.low_stock_alert).length;

  return {
    overdueOrders: { count: overdueOrders.length, balance: overdueOrders.reduce((s, o) => s + (o.balance || 0), 0) },
    overdueInvoices: { count: overdueInvoices.length, balance: overdueInvoices.reduce((s, i) => s + (i.balance || 0), 0) },
    newOrdersToday,
    newInvoicesToday,
    collectedToday,
    lowStockCount: lowRawMaterials + lowProducts,
    date: today,
  };
}
