import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

const materialSchema = z.object({
  rawMaterialId: z.string(),
  rawMaterialName: z.string(),
  unitName: z.string(),
  unitCost: z.number(),
  qtyPlanned: z.number(),
  qtyUsed: z.number().nullable(),
  qtyWasted: z.number().nullable(),
});

const patchSchema = z.object({
  woNumber: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string(),
  qtyToProduce: z.number().positive(),
  tailor: z.string().optional().default(""),
  startDate: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  materials: z.array(materialSchema).default([]),
  laborCostPerPiece: z.number().min(0).default(0),
  notes: z.string().optional().default(""),
});

/** Editing is only offered in the UI while status !== "completed" — enforced here too now that
 *  this is a server route, not just a client-side convention. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageManufacturing) return NextResponse.json({ error: "No permission to manage manufacturing" }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const { data: row } = await supabase.from("work_orders").select("status").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  if (row.status === "completed") {
    return NextResponse.json({ error: "This work order is already completed and can't be edited." }, { status: 409 });
  }

  const { error } = await supabase
    .from("work_orders")
    .update({
      product_id: fd.productId,
      product_name: fd.productName,
      qty_to_produce: fd.qtyToProduce,
      tailor: fd.tailor,
      start_date: fd.startDate,
      due_date: fd.dueDate || null,
      materials: fd.materials as never,
      labor_cost_per_piece: fd.laborCostPerPiece,
      notes: fd.notes.trim(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Work order updated: ${fd.woNumber}`);
  return NextResponse.json({ ok: true });
}

/** Reverses raw-material consumption / finished-goods production ledger rows before deleting —
 *  always SUM(movement), so this correctly restores stock even if the work order was never
 *  completed (no ledger rows exist yet, a no-op). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageManufacturing) return NextResponse.json({ error: "No permission to manage manufacturing" }, { status: 403 });

  const { data: row } = await supabase.from("work_orders").select("wo_number, status").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

  await supabase.from("inventory_ledger").delete().eq("ref_id", id).in("ref_type", ["work_order_consume", "work_order_produce"]);
  const { error } = await supabase.from("work_orders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Work order deleted: ${row.wo_number}` + (row.status === "completed" ? " — stock reverted" : ""));
  return NextResponse.json({ ok: true });
}
