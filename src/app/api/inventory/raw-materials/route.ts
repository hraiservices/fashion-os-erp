import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";
import type { ItemType } from "@/lib/inventory";

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  unitId: z.string().min(1),
  costPerUnit: z.number().min(0),
  category: z.string().default(""),
  lowStockAlert: z.number().min(0).default(0),
  notes: z.string().default(""),
  openingStock: z.number().optional(),
});

/**
 * Create/update a raw material. Previously ran entirely client-side (useSaveRawMaterial) with
 * no permission check at all — any authenticated user, including roles with manageInventory
 * explicitly false, could create/rewrite raw material records and their cost.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const isNew = !fd.id;

  const { data, error } = await supabase
    .from("raw_materials")
    .upsert({
      id: fd.id,
      name: fd.name.trim(),
      unit_id: fd.unitId,
      cost_per_unit: fd.costPerUnit,
      category: fd.category.trim(),
      low_stock_alert: fd.lowStockAlert,
      notes: fd.notes.trim(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isNew && fd.openingStock && fd.openingStock > 0) {
    const { error: ledgerError } = await supabase.from("inventory_ledger").insert({
      item_type: "raw_material" as ItemType,
      item_id: data.id,
      movement: fd.openingStock,
      ref_type: "opening",
      note: "Opening stock",
      created_by: user.email,
    });
    if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  await logAction(supabase, user.email, isNew ? `Raw material added: ${fd.name}` : `Raw material updated: ${fd.name}`);
  return NextResponse.json({ rawMaterial: data });
}
