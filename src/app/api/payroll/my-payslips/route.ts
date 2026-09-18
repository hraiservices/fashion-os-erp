import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapPayslipRow, mapPayrollRunRow } from "@/lib/types";

/**
 * Self-service: a staff login's own payslips, scoped by their user_roles.linked_employee_id —
 * not gated on managePayroll, since this is "your own data", not payroll administration. A
 * login with no linked employee record (most admin/manager accounts) just gets an empty list.
 */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.employeeId) return NextResponse.json({ payslips: [], runs: [] });

  // Service-role client, even though this is the caller's own data: payslips is readable to a
  // linked employee for their own rows (lockdown_reads_per_row.sql), but payroll_runs is gated
  // on managePayroll outright — and without the run there is no pay period to sort or label a
  // payslip by. The `.eq("employee_id", user.employeeId)` below, with employeeId taken from the
  // session rather than the request, is what scopes this to the caller.
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: payslipRows, error: payslipError } = await db.from("payslips").select("*").eq("employee_id", user.employeeId);
  if (payslipError) return NextResponse.json({ error: payslipError.message }, { status: 500 });

  const runIds = Array.from(new Set((payslipRows || []).map((r) => r.payroll_run_id)));
  const { data: runRows, error: runError } = runIds.length
    ? await db.from("payroll_runs").select("*").in("id", runIds)
    : { data: [], error: null };
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  const runs = (runRows || []).map(mapPayrollRunRow);
  const runById = new Map(runs.map((r) => [r.id, r]));
  // Newest pay period first — payslips have no created_at of their own, so order by the run
  // they belong to instead.
  const payslips = (payslipRows || [])
    .map(mapPayslipRow)
    .sort((a, b) => (runById.get(b.payrollRunId)?.periodStart || "").localeCompare(runById.get(a.payrollRunId)?.periodStart || ""));

  return NextResponse.json({ payslips, runs });
}
