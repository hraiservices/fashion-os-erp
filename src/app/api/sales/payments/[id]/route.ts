import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  // managePayments, not manageSales: the /sales/payments page gates its own delete button on
  // managePayments, so the two disagreed — a user with managePayments but not manageSales saw
  // the button and got a 403, while the sales role could delete via the API despite the UI
  // hiding it. managePayments also matches the stitching-order payment delete route.
  if (!user.perms.managePayments) return NextResponse.json({ error: "No permission to delete payments" }, { status: 403 });

  const { data: payment } = await supabase
    .from("sales_payments")
    .select("amount")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("sales_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Sales payment deleted: ₹${payment?.amount ?? "?"}`);
  return NextResponse.json({ ok: true });
}
