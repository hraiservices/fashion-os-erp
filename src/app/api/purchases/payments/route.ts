import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  billId: z.string().uuid(),
  vendorId: z.string().uuid(),
  billNumber: z.string().min(1),
  amount: z.number().positive("Amount must be positive"),
  method: z.string().min(1),
  date: z.string().min(1),
  note: z.string().default(""),
});

/**
 * Record a payment against a purchase bill.
 *
 * H-1: Previously ran client-side with no permission check and no overpayment
 * guard — any authenticated user could record payments exceeding the bill total,
 * creating phantom negative-balance (phantom credit) on the vendor account.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to record vendor payments" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  // H-1: Overpayment guard — fetch the bill total and outstanding balance.
  const { data: bill } = await supabase
    .from("purchase_bills")
    .select("total")
    .eq("id", fd.billId)
    .single();
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const { data: existingPayments } = await supabase
    .from("vendor_payments")
    .select("amount")
    .eq("bill_id", fd.billId);

  const { data: vendorCredits } = await supabase
    .from("vendor_credits")
    .select("total")
    .eq("bill_id", fd.billId);

  const paidSoFar = (existingPayments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const creditedSoFar = (vendorCredits || []).reduce((s, c) => s + (c.total || 0), 0);
  const balance = bill.total - paidSoFar - creditedSoFar;

  if (fd.amount > balance + 0.01) {
    return NextResponse.json(
      { error: `Payment of ₹${fd.amount} exceeds the outstanding balance of ₹${balance.toFixed(2)}` },
      { status: 422 }
    );
  }

  const { error } = await supabase.from("vendor_payments").insert({
    bill_id: fd.billId,
    vendor_id: fd.vendorId,
    amount: fd.amount,
    method: fd.method,
    date: fd.date,
    note: fd.note.trim(),
    created_by: user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Payment to vendor: ₹${fd.amount} for bill ${fd.billNumber}`);
  return NextResponse.json({ ok: true });
}
