import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

/**
 * Delete a sales invoice.
 *
 * H-3: Deleting an invoice that has payments would leave orphaned payment
 * records referencing a non-existent invoice. Reject the delete — the user
 * must first delete all payments (which requires manageSales), then delete
 * the invoice.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to delete invoices" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: invoice } = await db
    .from("sales_invoices")
    .select("invoice_number")
    .eq("id", id)
    .maybeSingle();

  // H-3: Block delete if payments exist.
  const { data: payments } = await db
    .from("sales_payments")
    .select("id")
    .eq("invoice_id", id)
    .limit(1);

  if (payments && payments.length > 0) {
    return NextResponse.json(
      { error: "This invoice has payments recorded. Delete all payments first, then delete the invoice." },
      { status: 409 }
    );
  }

  // Block delete if credit notes exist (they reference this invoice).
  const { data: credits } = await db
    .from("sales_credit_notes")
    .select("id")
    .eq("invoice_id", id)
    .limit(1);

  if (credits && credits.length > 0) {
    return NextResponse.json(
      { error: "This invoice has credit notes. Delete the credit notes first, then delete the invoice." },
      { status: 409 }
    );
  }

  // Reverse stock movements first (same as the original hook).
  await db.from("inventory_ledger").delete().eq("ref_type", "sale").eq("ref_id", id);

  const { error } = await db.from("sales_invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Invoice deleted: ${invoice?.invoice_number ?? id}`);
  return NextResponse.json({ ok: true });
}
