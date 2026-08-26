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
 *
 * The overpayment check was itself a read-then-insert race (two near-simultaneous payments
 * could both read the same balance and both pass) — now goes through record_vendor_payment(),
 * which row-locks the bill for the duration, mirroring record_order_payment's own pattern.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to record vendor payments" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const { error } = await supabase.rpc("record_vendor_payment", {
    p_bill_id: fd.billId,
    p_vendor_id: fd.vendorId,
    p_amount: fd.amount,
    p_method: fd.method,
    p_date: fd.date,
    p_note: fd.note.trim(),
    p_created_by: user.email,
  });
  if (error) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("exceeds") ? 422 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  await logAction(supabase, user.email, `Payment to vendor: ₹${fd.amount} for bill ${fd.billNumber}`);
  return NextResponse.json({ ok: true });
}
