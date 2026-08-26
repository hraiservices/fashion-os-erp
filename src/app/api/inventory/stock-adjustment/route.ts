import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  itemType: z.enum(["raw_material", "product"]),
  itemId: z.string(),
  itemName: z.string(),
  movement: z.number().refine((n) => n !== 0, "Enter a non-zero quantity"),
  note: z.string().default(""),
});

/** Manual stock correction — the only ledger write path exposed directly to users in Phase 1.
 *  Previously ran entirely client-side with no permission check, meaning any authenticated
 *  user — including a tailor whose manageInventory is explicitly false — could fabricate or
 *  erase stock. */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const { error } = await supabase.from("inventory_ledger").insert({
    item_type: fd.itemType,
    item_id: fd.itemId,
    movement: fd.movement,
    ref_type: "adjustment",
    note: fd.note.trim(),
    created_by: user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Stock adjustment: ${fd.itemName} (${fd.movement > 0 ? "+" : ""}${fd.movement})`, null, fd.note);
  return NextResponse.json({ ok: true });
}
