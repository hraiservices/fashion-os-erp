import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToAll } from "@/lib/push";
import { mapProductRow, mapCustomerRow, mapSalesInvoiceRow } from "@/lib/types";
import { matchCustomersForProduct, groupInvoicesByMobile } from "@/lib/customer-product-matching";

const bodySchema = z.object({
  productId: z.string().min(1),
  /** Only positive movements (restock/opening stock) are worth notifying about. */
  movement: z.number(),
});

/**
 * Phase 5 of Customer Purchase Intelligence: fired (best-effort, fire-and-forget from the
 * client) whenever a product's stock increases. Runs the Phase 3 matching engine server-side
 * — it needs the VAPID private key, which never reaches the browser — and pushes a single
 * broadcast notification if there are strong matches. This intentionally does NOT target
 * individual customers' devices (there's no such concept — push subscriptions belong to shop
 * staff, not end customers); it tells the merchant "N customers may want this," and tapping it
 * opens the product's edit page, which already has the full "Potential customers" list (Phase 3).
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { productId, movement } = parsed.data;
  if (movement <= 0) return NextResponse.json({ ok: true, skipped: "not a stock increase" });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ ok: true, skipped: "not configured" });

  const [{ data: productRow }, { data: productRows }, { data: customerRows }, { data: invoiceRows }] = await Promise.all([
    supabase.from("products").select("*").eq("id", productId).maybeSingle(),
    supabase.from("products").select("*"),
    supabase.from("customers").select("*"),
    supabase.from("sales_invoices").select("*"),
  ]);
  if (!productRow) return NextResponse.json({ ok: true, skipped: "product not found" });

  const product = mapProductRow(productRow, 0, []);
  const productsById = new Map((productRows || []).map((r) => [r.id, mapProductRow(r, 0, [])]));
  const customers = (customerRows || []).map(mapCustomerRow);
  const invoices = (invoiceRows || []).map(mapSalesInvoiceRow);
  const invoicesByMobile = groupInvoicesByMobile(invoices);

  // Threshold higher than the in-app list (30) — a push notification interrupts the merchant,
  // so it should only fire for genuinely strong matches, not every marginal one.
  const matches = matchCustomersForProduct(product, customers, invoicesByMobile, productsById, 50);
  if (matches.length === 0) return NextResponse.json({ ok: true, matches: 0 });

  await sendPushToAll({
    title: `New stock match: ${product.name}`,
    body: `${matches.length} customer${matches.length === 1 ? "" : "s"} may be interested — top match: ${matches[0].customer.name} (${matches[0].score}%)`,
    url: `/inventory/products/${product.id}/edit`,
  });

  return NextResponse.json({ ok: true, matches: matches.length });
}
