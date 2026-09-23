import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapOrderRow } from "@/lib/types";
import { OrdersListDocument } from "@/lib/pdf/orders-list-document";
import { DEFAULT_STITCHING_ORDER_TEMPLATES_SETTING, getDefaultStitchingOrderTemplate, type StitchingOrderTemplatesSetting } from "@/lib/stitching-order-template";
import { istDateString } from "@/lib/ist-date";

// @react-pdf/renderer needs Node's stream/fs APIs — not Edge-compatible.
export const runtime = "nodejs";

/**
 * PDF download for the shop-wide Orders print list (Orders -> Print list) — every customer's
 * orders for a chosen date range together, one row each with payment status/total/due. Same
 * customer-facing auth gate as the other order PDFs (/api/orders/[id]/pdf,
 * /api/customers/[mobile]/statement/pdf): logged in only, no extra permission.
 */
export async function GET(req: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const url = new URL(req.url);
  const dateField = (url.searchParams.get("dateField") || "order") as "order" | "delivery";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const dateColumn = dateField === "delivery" ? "delivery_date" : "in_date";

  let query = db.from("orders").select("*").order(dateColumn, { ascending: true });
  if (from) query = query.gte(dateColumn, from);
  if (to) query = query.lte(dateColumn, to);

  const [{ data: orderRows, error: orderError }, { data: shopSetting }, { data: templateSetting }] = await Promise.all([
    query,
    supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "stitchingOrderTemplates").maybeSingle(),
  ]);
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  const orders = (orderRows || []).map(mapOrderRow);
  if (orders.length === 0) {
    return NextResponse.json({ error: "No orders found for this date range" }, { status: 404 });
  }

  const shop = (shopSetting?.value as { name?: string; phone?: string; address?: string } | null) || {};
  const template = getDefaultStitchingOrderTemplate((templateSetting?.value as StitchingOrderTemplatesSetting | null) || DEFAULT_STITCHING_ORDER_TEMPLATES_SETTING);

  const buffer = await renderToBuffer(
    <OrdersListDocument orders={orders} dateField={dateField} from={from} to={to} shopName={shop.name || ""} shopPhone={shop.phone || ""} shopAddress={shop.address || ""} generatedAt={istDateString()} template={template} />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="orders-list.pdf"`,
    },
  });
}
