import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to delete vendor payments" }, { status: 403 });

  const { data: payment } = await supabase
    .from("vendor_payments")
    .select("amount")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("vendor_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Vendor payment deleted: ₹${payment?.amount ?? "?"}`);
  return NextResponse.json({ ok: true });
}
