import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  itemType: z.enum(["raw_material", "product"]),
  itemId: z.string(),
  itemName: z.string(),
  fromWarehouseId: z.string().nullable(),
  toWarehouseId: z.string(),
  qty: z.number().positive("Enter a quantity greater than zero"),
  note: z.string().default(""),
});

/** Moves stock between warehouses as a paired transfer_out/transfer_in ledger entry.
 *  Previously ran entirely client-side with no permission check. */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  if (fd.fromWarehouseId === fd.toWarehouseId) return NextResponse.json({ error: "Source and destination warehouses must differ" }, { status: 400 });

  const { error } = await supabase.from("inventory_ledger").insert([
    {
      item_type: fd.itemType,
      item_id: fd.itemId,
      movement: -fd.qty,
      ref_type: "transfer_out",
      note: fd.note.trim(),
      warehouse_id: fd.fromWarehouseId,
      created_by: user.email,
    },
    {
      item_type: fd.itemType,
      item_id: fd.itemId,
      movement: fd.qty,
      ref_type: "transfer_in",
      note: fd.note.trim(),
      warehouse_id: fd.toWarehouseId,
      created_by: user.email,
    },
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Stock transfer: ${fd.itemName} (${fd.qty})`, null, fd.note);
  return NextResponse.json({ ok: true });
}
