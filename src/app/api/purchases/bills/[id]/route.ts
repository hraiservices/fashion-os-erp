import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/**
 * Delete a purchase bill.
 *
 * H-3: Deleting a bill that has vendor payments would leave orphaned payment
 * records. Reject the delete — user must clear payments and credits first.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to delete bills" }, { status: 403 });

  const { data: bill } = await supabase
    .from("purchase_bills")
    .select("bill_number")
    .eq("id", id)
    .maybeSingle();

  const { data: payments } = await supabase
    .from("vendor_payments")
    .select("id")
    .eq("bill_id", id)
    .limit(1);

  if (payments && payments.length > 0) {
    return NextResponse.json(
      { error: "This bill has payments recorded. Delete all payments first, then delete the bill." },
      { status: 409 }
    );
  }

  const { data: credits } = await supabase
    .from("vendor_credits")
    .select("id")
    .eq("bill_id", id)
    .limit(1);

  if (credits && credits.length > 0) {
    return NextResponse.json(
      { error: "This bill has vendor credits. Delete the credits first, then delete the bill." },
      { status: 409 }
    );
  }

  await supabase.from("inventory_ledger").delete().eq("ref_type", "purchase").eq("ref_id", id);

  const { error } = await supabase.from("purchase_bills").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Bill deleted: ${bill?.bill_number ?? id}`);
  return NextResponse.json({ ok: true });
}
