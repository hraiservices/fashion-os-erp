import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  invoiceId: z.string().uuid(),
  customerMobile: z.string().min(1),
  invoiceNumber: z.string().min(1),
  amount: z.number().positive("Amount must be positive"),
  method: z.string().min(1),
  date: z.string().min(1),
  note: z.string().default(""),
  posSessionId: z.string().uuid().nullable().optional(),
});

/**
 * Record a payment against a sales invoice.
 *
 * Previously this ran entirely client-side with no permission check and no
 * overpayment guard — any authenticated user could record a ₹0 payment or a
 * payment larger than the invoice total, either of which corrupts the
 * paid/balance figures derived from SUM(sales_payments.amount).
 *
 * The overpayment check below now happens inside record_sales_payment() (a single
 * SELECT ... FOR UPDATE + INSERT), not as a separate read-then-insert in this route — two
 * near-simultaneous payments against the same invoice used to both read the same "balance so
 * far" and both pass, together overpaying it. Mirrors record_order_payment/
 * record_vendor_payment's existing row-lock pattern.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  // managePayments, not manageSales — matches the invoice detail page's own gate on its
  // "Record payment" button and the DELETE route below it, which already made this switch.
  // Was manageSales, so a user granted managePayments but not manageSales saw the button,
  // filled the form, and got a 403 on submit.
  if (!user.perms.managePayments) return NextResponse.json({ error: "No permission to record sales payments" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const { error } = await db.rpc("record_sales_payment", {
    p_invoice_id: fd.invoiceId,
    p_customer_mobile: fd.customerMobile,
    p_amount: fd.amount,
    p_method: fd.method,
    p_date: fd.date,
    p_note: fd.note.trim(),
    p_pos_session_id: fd.posSessionId ?? null,
    p_created_by: user.email,
  });
  if (error) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("exceeds") ? 422 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  await logAction(supabase, user.email, `Payment received: ₹${fd.amount} for invoice ${fd.invoiceNumber}`);
  return NextResponse.json({ ok: true });
}
