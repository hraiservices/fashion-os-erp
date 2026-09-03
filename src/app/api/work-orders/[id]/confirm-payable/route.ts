import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

/**
 * Confirms a completed work order's laborCost as a real tailor payable — gated managePayroll,
 * deliberately separate from manageManufacturing (which gates completing the work order
 * itself). A tailor holding manageManufacturing can complete their own work order today, so
 * letting that same action also finalize their own pay would be a self-dealing gap. Payroll
 * aggregation only ever counts confirmed work orders — see src/lib/piece-rate.ts.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to confirm tailor payables" }, { status: 403 });

  // work_orders is read-scoped for `authenticated` (lockdown_reads_per_row.sql) and managePayroll
  // is not one of the permissions that opens it, so this lookup has to use the service client.
  // The managePayroll check above is the authority.
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: row, error: fetchError } = await db
    .from("work_orders")
    .select("id, wo_number, status, labor_payable_confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

  if (row.status !== "completed") {
    return NextResponse.json({ error: "This work order hasn't been completed yet — no payable to confirm." }, { status: 409 });
  }

  if (row.labor_payable_confirmed_at) {
    return NextResponse.json({ ok: true, confirmedAt: row.labor_payable_confirmed_at });
  }

  // Routed through the SECURITY DEFINER RPC — the confirmation columns are trigger-guarded
  // (add_piece_rate_p0_fixes.sql) against direct writes, so this is the only path that works.
  const { data: updatedRows, error: updateError } = await supabase.rpc("confirm_wo_payable", {
    p_wo_id: id,
    p_user_email: user.email,
  });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  const confirmedAt = updatedRows?.[0]?.labor_payable_confirmed_at || new Date().toISOString();

  await logAction(supabase, user.email, `✅ Tailor payable confirmed for work order ${row.wo_number}`);

  return NextResponse.json({ ok: true, confirmedAt });
}
