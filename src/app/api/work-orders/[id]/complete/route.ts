import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { computeWoCost, type WorkOrderMaterial } from "@/lib/manufacturing";

const materialSchema = z.object({
  rawMaterialId: z.string(),
  rawMaterialName: z.string(),
  unitName: z.string(),
  unitCost: z.number(),
  qtyPlanned: z.number(),
  qtyUsed: z.number().nullable(),
  qtyWasted: z.number().nullable(),
});

const bodySchema = z.object({ materials: z.array(materialSchema) });

/**
 * Completing a work order is the moment stock actually moves and cost gets frozen — moved
 * server-side (previously a direct client Supabase write under permissive RLS) so
 * manageManufacturing is actually enforced, not just a UI convention. qtyToProduce,
 * laborCostPerPiece and tailor are read from the row itself rather than trusted from the
 * request body — the client only supplies what it's actually responsible for reporting
 * (how much material was really used/wasted).
 *
 * The status update, consumption ledger rows, and production ledger row all happen inside
 * complete_work_order() — one transaction, not three independent calls. A crash/timeout
 * between them used to be able to leave a work order "completed" with materials consumed but
 * nothing produced (or the reverse); now either the whole completion commits or none of it
 * does, and a concurrent duplicate "complete" click is rejected by the RPC's own row lock.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageManufacturing) return NextResponse.json({ error: "No permission to manage manufacturing" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data: wo } = await db
    .from("work_orders")
    .select("wo_number, product_id, qty_to_produce, labor_cost_per_piece, status")
    .eq("id", id)
    .maybeSingle();
  if (!wo) return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  if (wo.status === "completed") {
    return NextResponse.json({ error: "This work order is already completed." }, { status: 409 });
  }

  const materials = parsed.data.materials as WorkOrderMaterial[];
  const cost = computeWoCost(materials, wo.labor_cost_per_piece, wo.qty_to_produce);

  const consumeRows = materials
    .filter((m) => (m.qtyUsed || 0) + (m.qtyWasted || 0) > 0)
    .map((m) => ({
      itemId: m.rawMaterialId,
      movement: -((m.qtyUsed || 0) + (m.qtyWasted || 0)),
      note: `Consumed for ${wo.wo_number}`,
    }));

  const { error } = await db.rpc("complete_work_order", {
    p_work_order_id: id,
    p_materials: materials as never,
    p_material_cost: cost.materialCost,
    p_wastage_cost: cost.wastageCost,
    p_labor_cost: cost.laborCost,
    p_total_cost: cost.totalCost,
    p_cost_per_unit: cost.costPerUnit,
    p_consume: consumeRows as never,
    p_product_id: wo.product_id,
    p_qty_to_produce: wo.qty_to_produce,
    p_wo_number: wo.wo_number,
    p_created_by: user.email,
  });
  if (error) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("already completed") ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  await logAction(supabase, user.email, `Work order completed: ${wo.wo_number}`, null, `Cost/unit ₹${cost.costPerUnit}`);
  return NextResponse.json({ ok: true, costPerUnit: cost.costPerUnit });
}
