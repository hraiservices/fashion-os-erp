import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

/** Deletes an advance. Server-side so managePayroll is enforced — this used to be a direct
 *  browser-to-Supabase delete with no permission check.
 *
 *  An advance with no payslip_id hasn't been charged against anyone's pay yet — deleting it is
 *  the correct way to reverse a mistaken entry (unpaid advances are summed live off this table,
 *  see employees/advances/bulk/route.ts, so there's nothing cached to drift). But an advance
 *  already linked to a finalized payslip (payslip_id set) represents cash that genuinely already
 *  left the register and was already deducted from that employee's pay — deleting it then would
 *  silently rewrite history: the payslip's own deduction total stops matching any advance that
 *  justifies it, with no record the cash was ever handed over. Same "already settled, can't
 *  silently vanish" guard as order_payments' piece_rate_paid_at check. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  // Write-locked for `authenticated` — see lockdown_hr_payroll_writes.sql. The permission
  // check above is what authorises this; logAction keeps using the caller's own session so
  // the audit trail still names the real actor.
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: row, error: fetchError } = await db.from("employee_advances").select("amount, payslip_id").eq("id", id).maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Advance not found" }, { status: 404 });
  if (row.payslip_id) {
    return NextResponse.json(
      { error: `This advance of ₹${row.amount} has already been deducted in a finalized payslip and cannot be deleted. Correct it via a new advance/adjustment instead.` },
      { status: 409 }
    );
  }

  const { error } = await db.from("employee_advances").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Advance deleted: ${id}`);
  return NextResponse.json({ ok: true });
}
