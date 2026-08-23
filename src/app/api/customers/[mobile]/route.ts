import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/**
 * Delete a customer and their order history.
 *
 * Previously this ran entirely client-side as
 *   supabase.from("orders").delete().eq("mobile", mobile)
 * with no server-side authorization at all — any authenticated user could wipe every
 * order belonging to a customer, including delivered and fully-paid ones, bypassing both
 * the deleteCustomers permission and the paid/delivered guard on the per-order delete.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.deleteCustomers) return NextResponse.json({ error: "No permission to delete customers" }, { status: 403 });

  const { data: cust } = await supabase.from("customers").select("name").eq("id", `CUST-${mobile}`).maybeSingle();

  const { data: deletedCount, error } = await supabase.rpc("delete_customer_cascade", { p_mobile: mobile });

  if (error) {
    if (error.message?.includes("HAS_SETTLED_ORDERS")) {
      return NextResponse.json(
        { error: "This customer has delivered or paid orders. Those are accounting records and cannot be deleted." },
        { status: 409 }
      );
    }
    if (error.message?.includes("HAS_ISSUED_INVOICES")) {
      return NextResponse.json(
        { error: "This customer has issued sales invoices. Those are accounting records and cannot be deleted." },
        { status: 409 }
      );
    }
    if (error.message?.includes("HAS_OUTSTANDING_BALANCE")) {
      return NextResponse.json(
        { error: "This customer still has an outstanding balance (orders or sales invoices). Settle or write it off before deleting." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction(
    supabase, user.email,
    `🗑️ Customer deleted: ${cust?.name || mobile} (${mobile})`,
    null,
    `${deletedCount ?? 0} order(s) removed`
  );
  return NextResponse.json({ ok: true, deletedOrders: deletedCount ?? 0 });
}
