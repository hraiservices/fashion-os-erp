import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/** Cancels a purchase order. Previously ran entirely client-side (useCancelPurchaseOrder) with
 *  no permission check at all. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to manage purchase orders" }, { status: 403 });

  const { data: po } = await supabase.from("purchase_orders").select("po_number").eq("id", id).maybeSingle();

  const { error } = await supabase.from("purchase_orders").update({ status: "cancelled" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Purchase order cancelled: ${po?.po_number ?? id}`);
  return NextResponse.json({ ok: true });
}
