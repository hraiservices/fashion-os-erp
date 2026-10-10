import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { sendPushToAll } from "@/lib/push";
import { mapProductRow, mapCustomerRow, mapSalesInvoiceRow } from "@/lib/types";
import { matchCustomersForProduct, groupInvoicesByMobile } from "@/lib/customer-product-matching";

/**
 * Runs the customer-matching engine for products that just received stock and pushes one
 * notification to shop staff if there are strong matches. Needs a service-role client (the push
 * VAPID key never reaches the browser). Best-effort: callers run it after the response is sent,
 * and it must never throw into the stock write that triggered it.
 *
 * The candidate pool is capped — safe for a push notification (at worst a very large shop misses a
 * few marginal matches), unlike a ledger total.
 */
const CANDIDATE_LIMIT = 5_000;
/** A push interrupts the merchant, so it only fires for genuinely strong matches (the in-app list uses 30). */
const PUSH_MIN_SCORE = 50;

export async function notifyStockMatches(db: SupabaseClient<Database>, productIds: string[]): Promise<{ products: number; matches: number }> {
  const ids = Array.from(new Set(productIds)).slice(0, 30);
  if (!ids.length) return { products: 0, matches: 0 };

  // Shared data is read once, however many products arrived (a purchase bill can carry many lines).
  const [{ data: productRows }, { data: customerRows }, { data: invoiceRows }] = await Promise.all([
    db.from("products").select("*").limit(CANDIDATE_LIMIT),
    db.from("customers").select("*").limit(CANDIDATE_LIMIT),
    db.from("sales_invoices").select("*").order("invoice_date", { ascending: false }).limit(CANDIDATE_LIMIT),
  ]);
  const productsById = new Map((productRows || []).map((r) => [r.id, mapProductRow(r, 0, [])]));
  const customers = (customerRows || []).map(mapCustomerRow);
  const invoicesByMobile = groupInvoicesByMobile((invoiceRows || []).map(mapSalesInvoiceRow));

  const hits: { productId: string; name: string; count: number; topName: string; topScore: number }[] = [];
  for (const id of ids) {
    const product = productsById.get(id);
    if (!product) continue;
    const matches = matchCustomersForProduct(product, customers, invoicesByMobile, productsById, PUSH_MIN_SCORE);
    if (matches.length) hits.push({ productId: id, name: product.name, count: matches.length, topName: matches[0].customer.name, topScore: matches[0].score });
  }
  if (!hits.length) return { products: 0, matches: 0 };

  const total = hits.reduce((s, h) => s + h.count, 0);
  if (hits.length === 1) {
    const h = hits[0];
    await sendPushToAll({
      title: `New stock match: ${h.name}`,
      body: `${h.count} customer${h.count === 1 ? "" : "s"} may be interested — top match: ${h.topName} (${h.topScore}%)`,
      url: `/inventory/products/${h.productId}/edit`,
    });
  } else {
    // One summary instead of a burst of notifications when a bill brings in several products.
    await sendPushToAll({
      title: `New stock matches: ${hits.length} products`,
      body: `${total} customer matches in all — ${hits.slice(0, 3).map((h) => h.name).join(", ")}${hits.length > 3 ? "…" : ""}`,
      url: "/inventory/products",
    });
  }
  return { products: hits.length, matches: total };
}
