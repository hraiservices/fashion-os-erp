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
  if (!user.perms.voidSales) return NextResponse.json({ error: "No permission to delete invoices" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: invoice } = await db
    .from("sales_invoices")
    .select("invoice_number")
    .eq("id", id)
    .maybeSingle();

  // H-3: Block delete if payments exist. Both guards check their error, not just their data —
  // a discarded error yields `null`, which reads as "nothing blocking", so a transient read
  // failure deleted the invoice outright and orphaned its sales_payments rows. The create
  // route's edit guard already fails closed this way.
  const { data: payments, error: paymentsError } = await db
    .from("sales_payments")
    .select("id")
    .eq("invoice_id", id)
    .limit(1);
  if (paymentsError) return NextResponse.json({ error: `Couldn't check this invoice's payments — ${paymentsError.message}` }, { status: 500 });

  if (payments && payments.length > 0) {
    return NextResponse.json(
      { error: "This invoice has payments recorded. Delete all payments first, then delete the invoice." },
      { status: 409 }
    );
  }

  // Block delete if credit notes exist (they reference this invoice).
  const { data: credits, error: creditsError } = await db
    .from("sales_credit_notes")
    .select("id")
    .eq("invoice_id", id)
    .limit(1);
  if (creditsError) return NextResponse.json({ error: `Couldn't check this invoice's credit notes — ${creditsError.message}` }, { status: 500 });

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
