import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/**
 * Delete a raw material. Previously ran entirely client-side with no permission check and no
 * guard against deleting one with existing stock/ledger history — inventory_ledger.item_id has
 * no real FK (by design), so the row disappeared from every UI while its ledger rows stayed
 * behind forever, silently vanishing that value from the Inventory Valuation report with no
 * audit trail. Now blocks the delete if any ledger movement exists for this item at all.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const { data: material } = await supabase.from("raw_materials").select("name").eq("id", id).maybeSingle();

  const { data: ledgerRows } = await supabase
    .from("inventory_ledger")
    .select("id")
    .eq("item_type", "raw_material")
    .eq("item_id", id)
    .limit(1);
  if (ledgerRows && ledgerRows.length > 0) {
    return NextResponse.json(
      { error: "This raw material has stock movement history (purchases, consumption, adjustments) and cannot be deleted." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("raw_materials").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Raw material deleted: ${material?.name ?? id}`);
  return NextResponse.json({ ok: true });
}
