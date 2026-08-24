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

const bodySchema = z.object({
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

/**
 * Create a work order. Server-side so manageManufacturing is enforced — this used to be a
 * direct browser-to-Supabase insert under a permissive RLS policy, so the permission was
 * UI-only.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageManufacturing) return NextResponse.json({ error: "No permission to manage manufacturing" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const { data, error } = await supabase
    .from("work_orders")
    .insert({
      wo_number: fd.woNumber,
      product_id: fd.productId,
      product_name: fd.productName,
      qty_to_produce: fd.qtyToProduce,
      tailor: fd.tailor,
      start_date: fd.startDate,
      due_date: fd.dueDate || null,
      status: "draft",
      materials: fd.materials as never,
      labor_cost_per_piece: fd.laborCostPerPiece,
      notes: fd.notes.trim(),
      created_by: user.email,
    })
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Create failed" }, { status: 500 });

  await logAction(supabase, user.email, `Work order created: ${fd.woNumber} (${fd.qtyToProduce}x ${fd.productName})`);
  return NextResponse.json({ id: data.id as string });
}
