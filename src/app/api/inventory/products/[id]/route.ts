import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

const patchSchema = z.object({
  sellingPrice: z.number().min(0).optional(),
  name: z.string().min(1),
  /** Archive/unarchive — the only way to actually retire a product that has stock ledger
   *  history and so can't be hard-deleted (see DELETE below). */
  active: z.boolean().optional(),
});

/** Targeted single-field patch (e.g. inline table editing, archive/unarchive) — unlike the full
 *  product save, never touches BOM rows. Previously ran entirely client-side with no permission check. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { sellingPrice, name, active } = parsed.data;

  const update: { selling_price?: number; active?: boolean } = {};
  if (sellingPrice !== undefined) update.selling_price = sellingPrice;
  if (active !== undefined) update.active = active;

  const { error } = await supabase.from("products").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (sellingPrice !== undefined) await logAction(supabase, user.email, `Product price updated: ${name} → ${sellingPrice}`);
  if (active !== undefined) await logAction(supabase, user.email, `Product ${active ? "unarchived" : "archived"}: ${name}`);
  return NextResponse.json({ ok: true });
}

/**
 * Delete a product. Previously ran entirely client-side with no permission check and no guard
 * against deleting one with existing stock/ledger history — same gap as raw materials (see
 * that route's comment). Now blocks the delete if any ledger movement exists for this item.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const { data: product } = await supabase.from("products").select("name").eq("id", id).maybeSingle();

  const { data: ledgerRows } = await supabase
    .from("inventory_ledger")
    .select("id")
    .eq("item_type", "product")
    .eq("item_id", id)
    .limit(1);
  if (ledgerRows && ledgerRows.length > 0) {
    return NextResponse.json(
      { error: "This product has stock movement history (purchases, sales, adjustments) and cannot be deleted. Archive it instead to hide it from new sales while keeping its history." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Product deleted: ${product?.name ?? id}`);
  return NextResponse.json({ ok: true });
}
