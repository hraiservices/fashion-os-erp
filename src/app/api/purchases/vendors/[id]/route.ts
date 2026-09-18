import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

/**
 * Delete a vendor.
 *
 * Previously ran entirely client-side (useDeleteVendor) with no permission check. Also fixes a
 * separate bug: the delete confirmation dialog claims "bills already recorded against this
 * vendor are kept," but purchase_bills/purchase_orders/vendor_payments/vendor_credits.vendor_id
 * all reference vendors with no ON DELETE clause (default NO ACTION) — deleting a vendor with
 * any purchase history actually fails outright with a raw Postgres FK-violation string. Give a
 * clear message instead of surfacing that.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to manage vendors" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: vendor } = await db.from("vendors").select("name").eq("id", id).maybeSingle();

  const { error } = await db.from("vendors").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "This vendor has purchase orders, bills, payments, or credits recorded against it and cannot be deleted." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction(supabase, user.email, `Vendor deleted: ${vendor?.name ?? id}`);
  return NextResponse.json({ ok: true });
}
