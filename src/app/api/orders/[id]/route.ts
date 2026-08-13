import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { logAction } from "@/lib/logging";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.deleteOrder) return NextResponse.json({ error: "No permission to delete orders" }, { status: 403 });

  const { data: row, error: fetchError } = await supabase.from("orders").select("id,name,status,balance").eq("id", id).maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const order = mapOrderRow(row as Parameters<typeof mapOrderRow>[0]);

  // Refuse to delete orders that have been paid or delivered — these are financial records.
  if (order.status === "payment" || order.status === "delivered") {
    return NextResponse.json(
      { error: `Cannot delete a ${order.status === "payment" ? "paid" : "delivered"} order. Archive it instead.` },
      { status: 409 }
    );
  }

  const { error: deleteError } = await supabase.from("orders").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await logAction(supabase, user.email, `🗑️ Order deleted: ${order.name}`, id);
  return NextResponse.json({ ok: true });
}
