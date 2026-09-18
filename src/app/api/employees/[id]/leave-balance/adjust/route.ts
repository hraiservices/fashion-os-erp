import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapLeaveBalanceAdjustmentRow } from "@/lib/types";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  leaveTypeId: z.string().min(1),
  year: z.number().int(),
  days: z.number().refine((n) => n !== 0, "Adjustment cannot be zero"),
  reason: z.string().min(1, "A reason is required for balance adjustments"),
});

/** Manual admin correction to a leave balance — always inserted as an audited ledger row
 *  (mirrors loyalty_history), never an in-place update to a stored balance. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const { data: employee } = await db.from("employees").select("id, name").eq("id", id).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { data, error } = await db
    .from("leave_balance_adjustments")
    .insert({
      employee_id: id,
      leave_type_id: fd.leaveTypeId,
      year: fd.year,
      days: fd.days,
      reason: fd.reason,
      created_by: user.email,
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });

  await logAction(
    supabase,
    user.email,
    `Leave balance adjusted for ${employee.name}: ${fd.days > 0 ? "+" : ""}${fd.days} days`,
    null,
    fd.reason
  );
  return NextResponse.json({ adjustment: mapLeaveBalanceAdjustmentRow(data) });
}
