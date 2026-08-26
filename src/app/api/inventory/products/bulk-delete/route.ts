import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

/** Bulk-delete products. Previously ran entirely client-side with no permission check and no
 *  stock-history guard — see the single-product DELETE route's comment. Any product in the
 *  batch with ledger history is skipped rather than failing the whole batch. */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { ids } = parsed.data;

  const { data: ledgerRows } = await supabase.from("inventory_ledger").select("item_id").eq("item_type", "product").in("item_id", ids);
  const blockedIds = new Set((ledgerRows || []).map((r) => r.item_id));
  const deletableIds = ids.filter((id) => !blockedIds.has(id));

  if (deletableIds.length > 0) {
    const { error } = await supabase.from("products").delete().in("id", deletableIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAction(supabase, user.email, `${deletableIds.length} product(s) deleted`);
  }

  return NextResponse.json({ deleted: deletableIds.length, skipped: blockedIds.size });
}
