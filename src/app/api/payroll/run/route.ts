import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";
import { computeGrossPay, countAttendance } from "@/lib/payroll";
import { mapEmployeeRow, mapAttendanceRow } from "@/lib/types";

const bodySchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
});

/**
 * Run payroll for a period.
 *
 * Fixes several bugs vs. the original client-side useRunPayroll:
 *
 * C-1: No permission check existed — any authenticated user could run payroll.
 *
 * C-3: The original code deducted all unlinked advances regardless of whether
 * grossPay was sufficient to cover them. If advances > grossPay the shortfall
 * was silently written off — the advances were marked as "recovered" even
 * though only part of them actually reduced the employee's pay. Now advances
 * are only linked if they fit within the gross pay budget; excess advances
 * roll forward to the next run.
 *
 * C-4: No UNIQUE constraint on (period_start, period_end) — duplicate runs
 * double-deducted advances and generated duplicate payslips. The constraint
 * is added in the SQL migration; this route additionally does a preflight
 * check for a friendlier error. The loop is restructured to batch all inserts
 * so a mid-run failure leaves behind only the payroll_run header (which the
 * admin can delete as a draft), not a mix of some payslips and some missing.
 *
 * C-5: Monthly-salary employees with zero attendance records were paid their
 * full monthly salary (computeGrossPay with all-zero counts returns the full
 * rate for monthly employees). Now treated as fully absent (grossPay = 0) —
 * if attendance wasn't entered, payroll won't silently overpay.
 *
 * H-8: The original code passed userEmail from the browser body; this route
 * derives the actor's email from the server session cookie.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to run payroll" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { periodStart, periodEnd } = parsed.data;

  if (periodStart >= periodEnd) {
    return NextResponse.json({ error: "Period start must be before period end" }, { status: 400 });
  }

  // C-4 preflight: friendly error before hitting the DB UNIQUE constraint.
  const { data: existing } = await supabase
    .from("payroll_runs")
    .select("id")
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `Payroll for ${periodStart} – ${periodEnd} was already run.` }, { status: 409 });
  }

  // Create the run header.
  const { data: runRow, error: runError } = await supabase
    .from("payroll_runs")
    .insert({ period_start: periodStart, period_end: periodEnd, created_by: user.email, status: "draft" })
    .select()
    .single();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });
  const runId = runRow.id as string;

  let employeeCount = 0;

  try {
    const { data: employeeRows, error: empError } = await supabase
      .from("employees")
      .select("*")
      .eq("active", true);
    if (empError) throw empError;
    const employees = (employeeRows || []).map((r) => mapEmployeeRow(r));
    employeeCount = employees.length;

    // Compute all payslips in memory first so the batch insert is all-or-nothing.
    type PayslipRow = {
      payroll_run_id: string;
      employee_id: string;
      present_days: number;
      absent_days: number;
      half_days: number;
      leave_days: number;
      gross_pay: number;
      deductions: number;
      net_pay: number;
      status: string;
    };
    const payslipRows: PayslipRow[] = [];
    const advanceLinkMap: Map<string, string[]> = new Map(); // payslip placeholder → advance ids

    for (const employee of employees) {
      const { data: attRows } = await supabase
        .from("employee_attendance")
        .select("*")
        .eq("employee_id", employee.id)
        .gte("date", periodStart)
        .lte("date", periodEnd);

      const attendance = (attRows || []).map(mapAttendanceRow);

      // C-5: Monthly employees with no attendance data would receive full salary
      // since computeGrossPay(monthly, 0 absences, 0 present) = full rate.
      // Treat zero records as fully absent — don't silently overpay.
      let grossPay: number;
      if (attRows && attRows.length === 0 && employee.salaryType === "monthly") {
        grossPay = 0;
      } else {
        const counts = countAttendance(attendance);
        grossPay = computeGrossPay(employee, periodStart, periodEnd, counts);
      }

      const counts = countAttendance(attendance);

      const { data: advanceRows } = await supabase
        .from("employee_advances")
        .select("*")
        .eq("employee_id", employee.id)
        .is("payslip_id", null)
        .lte("date", periodEnd)
        .order("date", { ascending: true });

      // C-3: Only link advances that fit within the gross pay budget.
      // Excess advances roll forward to the next payroll run instead of
      // being silently written off.
      let budgetLeft = grossPay;
      const advancesToLink: string[] = [];
      let actualDeductions = 0;

      for (const adv of advanceRows || []) {
        const amount = adv.amount || 0;
        if (budgetLeft >= amount) {
          budgetLeft -= amount;
          actualDeductions += amount;
          advancesToLink.push(adv.id);
        }
        // If a single advance exceeds the remaining budget, skip it — it will
        // be picked up in the next run when the employee has earned enough.
      }

      const netPay = Math.max(0, Math.round((grossPay - actualDeductions) * 100) / 100);

      const rowKey = employee.id;
      payslipRows.push({
        payroll_run_id: runId,
        employee_id: employee.id,
        present_days: counts.presentDays,
        absent_days: counts.absentDays,
        half_days: counts.halfDays,
        leave_days: counts.leaveDays,
        gross_pay: grossPay,
        deductions: actualDeductions,
        net_pay: netPay,
        status: "draft",
      });
      advanceLinkMap.set(rowKey, advancesToLink);
    }

    // Batch insert all payslips — either all succeed or we clean up and fail.
    const { data: insertedPayslips, error: payslipError } = await supabase
      .from("payslips")
      .insert(payslipRows)
      .select("id, employee_id");
    if (payslipError) throw payslipError;

    // Link advances to their payslips.
    for (const ps of insertedPayslips || []) {
      const ids = advanceLinkMap.get(ps.employee_id) || [];
      if (ids.length > 0) {
        await supabase.from("employee_advances").update({ payslip_id: ps.id }).in("id", ids);
      }
    }
  } catch (err) {
    // Clean up the run header so the admin gets a clean slate.
    await supabase.from("payroll_runs").delete().eq("id", runId);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Payroll run failed" }, { status: 500 });
  }

  await logAction(supabase, user.email, `Payroll run generated: ${periodStart} to ${periodEnd} (${employeeCount} employees)`);
  return NextResponse.json({ ok: true, runId });
}
