import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/** Marks a payslip paid, or applies a manual bonus/deduction adjustment. Server-side so
 *  managePayroll is enforced — this used to be a direct browser-to-Supabase update, so any
 *  authenticated user could mark their own (or anyone's) payslip paid from the console with no
 *  permission check at all. */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark_paid") }),
  z.object({ action: z.literal("adjust"), amount: z.number(), note: z.string().max(500) }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  if (parsed.data.action === "adjust") {
    const { amount, note } = parsed.data;
    const { data: existing, error: fetchError } = await supabase
      .from("payslips")
      .select("status, gross_pay, overtime_pay, piece_rate_pay, deductions")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
    // Adjustments only make sense before a payslip is paid out — a paid payslip is history.
    if (existing.status === "paid") return NextResponse.json({ error: "Cannot adjust a payslip that's already been paid." }, { status: 409 });

    const netPay = Math.max(
      0,
      Math.round((existing.gross_pay + existing.overtime_pay + existing.piece_rate_pay + amount - existing.deductions) * 100) / 100
    );
    const { data, error } = await supabase
      .from("payslips")
      .update({ adjustment_amount: amount, notes: note, net_pay: netPay })
      .eq("id", id)
      .select("id, employee_id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });

    await logAction(supabase, user.email, `Payslip adjusted: ${id} (${amount >= 0 ? "+" : ""}${amount})`);
    return NextResponse.json({ ok: true });
  }

  const { data, error } = await supabase
    .from("payslips")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, employee_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });

  await logAction(supabase, user.email, `Payslip marked paid: ${id}`);
  return NextResponse.json({ ok: true });
}
