import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
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
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageManufacturing) return NextResponse.json({ error: "No permission to manage manufacturing" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data: wo } = await supabase
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

  const { error } = await supabase
    .from("work_orders")
    .update({
      status: "completed",
      materials: materials as never,
      material_cost: cost.materialCost,
      wastage_cost: cost.wastageCost,
      labor_cost: cost.laborCost,
      total_cost: cost.totalCost,
      cost_per_unit: cost.costPerUnit,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const consumeRows = materials
    .filter((m) => (m.qtyUsed || 0) + (m.qtyWasted || 0) > 0)
    .map((m) => ({
      item_type: "raw_material" as const,
      item_id: m.rawMaterialId,
      movement: -((m.qtyUsed || 0) + (m.qtyWasted || 0)),
      ref_type: "work_order_consume" as const,
      ref_id: id,
      note: `Consumed for ${wo.wo_number}`,
      created_by: user.email,
    }));
  if (consumeRows.length) {
    const { error: consumeError } = await supabase.from("inventory_ledger").insert(consumeRows);
    if (consumeError) return NextResponse.json({ error: consumeError.message }, { status: 500 });
  }

  const { error: produceError } = await supabase.from("inventory_ledger").insert({
    item_type: "product",
    item_id: wo.product_id,
    movement: wo.qty_to_produce,
    ref_type: "work_order_produce",
    ref_id: id,
    note: `Produced by ${wo.wo_number}`,
    created_by: user.email,
  });
  if (produceError) return NextResponse.json({ error: produceError.message }, { status: 500 });

  await logAction(supabase, user.email, `Work order completed: ${wo.wo_number}`, null, `Cost/unit ₹${cost.costPerUnit}`);
  return NextResponse.json({ ok: true, costPerUnit: cost.costPerUnit });
}
