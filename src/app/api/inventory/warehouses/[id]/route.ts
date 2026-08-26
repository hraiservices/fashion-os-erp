import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/** Delete a warehouse. Previously ran entirely client-side with no permission check. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const { data: warehouse } = await supabase.from("warehouses").select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from("warehouses").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json({ error: "This warehouse has stock movement history and cannot be deleted." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction(supabase, user.email, `Warehouse deleted: ${warehouse?.name ?? id}`);
  return NextResponse.json({ ok: true });
}
