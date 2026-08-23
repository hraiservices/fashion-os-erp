import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/** Marks a payslip paid. Server-side so managePayroll is enforced — this used to be a direct
 *  browser-to-Supabase update, so any authenticated user could mark their own (or anyone's)
 *  payslip paid from the console with no permission check at all. */
const bodySchema = z.object({ action: z.literal("mark_paid") });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

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
