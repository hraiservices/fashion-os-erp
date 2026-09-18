import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapOrderRow } from "@/lib/types";
import { StitchingOrderDocument } from "@/lib/pdf/stitching-order-document";
import { DEFAULT_STITCHING_ORDER_TEMPLATES_SETTING, getDefaultStitchingOrderTemplate, type StitchingOrderTemplatesSetting } from "@/lib/stitching-order-template";
import { DEF_MF_LABELS } from "@/lib/measurements";

// @react-pdf/renderer needs Node's stream/fs APIs — not Edge-compatible.
export const runtime = "nodejs";

/** Customer-facing stitching-order receipt PDF, using the customizable template from
 *  Settings -> Stitching Order Template (mirrors /api/sales/invoices/[id]/pdf). Orders have no
 *  extra read-permission gate beyond being logged in (same as the order detail page itself). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // orders is read-locked (lockdown_reads_whole_table.sql) — a normal session read comes back
  // empty/RLS-blocked, same reasoning as every other order route (e.g. payment/route.ts).
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const [{ data: orderRow, error }, { data: shopSetting }, { data: templateSetting }, { data: fieldsSetting }] = await Promise.all([
    db.from("orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "stitchingOrderTemplates").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "measureFields").maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!orderRow) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const order = mapOrderRow(orderRow);
  const shop = (shopSetting?.value as { name?: string; phone?: string; address?: string } | null) || {};
  const template = getDefaultStitchingOrderTemplate((templateSetting?.value as StitchingOrderTemplatesSetting | null) || DEFAULT_STITCHING_ORDER_TEMPLATES_SETTING);
  const measurementLabels = (fieldsSetting?.value as string[] | null) || [...DEF_MF_LABELS];

  let tailorName: string | undefined;
  if (order.tailor) {
    const { data: employeeRow } = await db.from("employees").select("name").eq("id", order.tailor).maybeSingle();
    tailorName = employeeRow?.name || order.tailor;
  }

  const buffer = await renderToBuffer(
    <StitchingOrderDocument
      order={order}
      shopName={shop.name || ""}
      shopPhone={shop.phone || ""}
      shopAddress={shop.address || ""}
      tailorName={tailorName}
      measurementLabels={measurementLabels}
      template={template}
    />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${order.id}.pdf"`,
    },
  });
}
