import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
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
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to record sales payments" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  // H-1: Overpayment guard — fetch the invoice total and outstanding balance.
  const { data: invoice } = await supabase
    .from("sales_invoices")
    .select("total")
    .eq("id", fd.invoiceId)
    .single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { data: existingPayments } = await supabase
    .from("sales_payments")
    .select("amount")
    .eq("invoice_id", fd.invoiceId);

  const { data: creditNotes } = await supabase
    .from("sales_credit_notes")
    .select("total")
    .eq("invoice_id", fd.invoiceId);

  const paidSoFar = (existingPayments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const creditedSoFar = (creditNotes || []).reduce((s, c) => s + (c.total || 0), 0);
  const balance = invoice.total - paidSoFar - creditedSoFar;

  if (fd.amount > balance + 0.01) {
    return NextResponse.json(
      { error: `Payment of ₹${fd.amount} exceeds the outstanding balance of ₹${balance.toFixed(2)}` },
      { status: 422 }
    );
  }

  const { error } = await supabase.from("sales_payments").insert({
    invoice_id: fd.invoiceId,
    customer_mobile: fd.customerMobile,
    amount: fd.amount,
    method: fd.method,
    date: fd.date,
    note: fd.note.trim(),
    pos_session_id: fd.posSessionId ?? null,
    created_by: user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Payment received: ₹${fd.amount} for invoice ${fd.invoiceNumber}`);
  return NextResponse.json({ ok: true });
}
