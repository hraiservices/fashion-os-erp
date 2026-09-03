import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { computeGrossPay, countAttendance } from "@/lib/payroll";
import { mapEmployeeRow, mapAttendanceRow, type Order, type WorkOrder } from "@/lib/types";
import { DEFAULT_ATTENDANCE_SETTINGS, type AttendanceSettings } from "@/lib/attendance-settings";
import { computePieceRatePay } from "@/lib/piece-rate";

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

  // Every table this run touches (employees, employee_attendance, employee_advances,
  // payroll_runs, payslips) is now write-locked for `authenticated`, and employees' salary
  // columns are only reachable with a service-role SELECT — see lockdown_hr_payroll_writes.sql
  // and lockdown_pin_hash_columns.sql. The managePayroll check above is what authorises all of
  // it; `supabase` (the caller's own session) is kept only for the audit-log write, so the
  // action is still attributed to the real actor rather than to the service role.
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured to run payroll (missing service role key)" }, { status: 501 });

  // C-4 preflight: friendly error before hitting the DB UNIQUE constraint.
  const { data: existing } = await db
    .from("payroll_runs")
    .select("id")
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `Payroll for ${periodStart} – ${periodEnd} was already run.` }, { status: 409 });
  }

  // Create the run header.
  const { data: runRow, error: runError } = await db
    .from("payroll_runs")
    .insert({ period_start: periodStart, period_end: periodEnd, created_by: user.email, status: "draft" })
    .select()
    .single();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });
  const runId = runRow.id as string;

  let employeeCount = 0;

  try {
    const { data: employeeRows, error: empError } = await db
      .from("employees")
      .select("*")
      .eq("active", true);
    if (empError) throw empError;
    const employees = (employeeRows || []).map((r) => mapEmployeeRow(r));
    employeeCount = employees.length;

    // Flat rupees-per-hour OT rate (per the "flat OT rate" decision, not a multiplier of each
    // employee's own rate) — one shop-wide setting, read once for the whole run.
    const { data: attSettingRow } = await db.from("app_settings").select("value").eq("key", "attendanceSettings").maybeSingle();
    const attendanceSettings: AttendanceSettings = { ...DEFAULT_ATTENDANCE_SETTINGS, ...((attSettingRow?.value as Partial<AttendanceSettings>) || {}) };

    // Compute all payslips in memory first so the batch insert is all-or-nothing.
    type PayslipRow = {
      payroll_run_id: string;
      employee_id: string;
      present_days: number;
      absent_days: number;
      half_days: number;
      leave_days: number;
      gross_pay: number;
      piece_rate_pay: number;
      deductions: number;
      net_pay: number;
      hours_worked: number;
      overtime_hours: number;
      overtime_pay: number;
      status: string;
    };
    const payslipRows: PayslipRow[] = [];
    const advanceLinkMap: Map<string, string[]> = new Map(); // payslip placeholder → advance ids

    // Batch attendance/advances for every employee in this run into 2 queries total instead
    // of 2 per employee — a payroll run over a large roster was previously O(N) round trips.
    const employeeIds = employees.map((e) => e.id);
    const hasPieceRateEmployees = employees.some((e) => e.pieceRateEligible);
    // IST has no DST and a fixed +5:30 offset — an explicit offset here (not a naive literal)
    // is what makes this compare correctly against ready_at/completed_at, which are UTC
    // timestamps. periodEnd's upper bound is inclusive through the end of that IST calendar
    // day. There's deliberately no lower bound: piece_rate_paid_at IS NULL is what scopes this
    // to "not yet paid" — a payable confirmed late (after its own period's run already
    // happened) still surfaces in the next run instead of being lost, and nothing already
    // marked paid can ever be summed again, however the chosen period overlaps a prior run.
    const periodEndOfDay = `${periodEnd}T23:59:59.999+05:30`;
    const [{ data: allAttRows }, { data: allAdvanceRows }, { data: confirmedOrderRows }, { data: confirmedWoRows }] = await Promise.all([
      db.from("employee_attendance").select("*").in("employee_id", employeeIds).gte("date", periodStart).lte("date", periodEnd),
      db.from("employee_advances").select("*").in("employee_id", employeeIds).is("payslip_id", null).lte("date", periodEnd).order("date", { ascending: true }),
      hasPieceRateEmployees
        ? db.from("orders").select("id, garments").not("payables_confirmed_at", "is", null).is("piece_rate_paid_at", null).lte("ready_at", periodEndOfDay)
        : Promise.resolve({ data: [] as { id: string; garments: unknown }[] }),
      hasPieceRateEmployees
        ? db.from("work_orders").select("id, tailor, labor_cost").not("labor_payable_confirmed_at", "is", null).is("piece_rate_paid_at", null).lte("completed_at", periodEndOfDay)
        : Promise.resolve({ data: [] as { id: string; tailor: string; labor_cost: number | null }[] }),
    ]);
    const confirmedOrders = (confirmedOrderRows || []) as (Pick<Order, "garments"> & { id: string })[];
    const confirmedWorkOrders = (confirmedWoRows || []).map((w) => ({ id: w.id, tailor: w.tailor, laborCost: w.labor_cost })) as (Pick<
      WorkOrder,
      "tailor" | "laborCost"
    > & { id: string })[];
    type AttRow = NonNullable<typeof allAttRows>[number];
    type AdvanceRow = NonNullable<typeof allAdvanceRows>[number];
    const attByEmployee = new Map<string, AttRow[]>();
    for (const row of allAttRows || []) {
      const list = attByEmployee.get(row.employee_id) || [];
      list.push(row);
      attByEmployee.set(row.employee_id, list);
    }
    const advancesByEmployee = new Map<string, AdvanceRow[]>();
    for (const row of allAdvanceRows || []) {
      const list = advancesByEmployee.get(row.employee_id) || [];
      list.push(row);
      advancesByEmployee.set(row.employee_id, list);
    }

    for (const employee of employees) {
      const attRows = attByEmployee.get(employee.id) || [];
      const attendance = attRows.map(mapAttendanceRow);

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

      // Hours/overtime are only ever populated by self-service checkout (Phase 2) — manual
      // attendance rows have hours_worked=null and overtime_hours=0, so they simply contribute
      // nothing here rather than needing separate handling.
      const totalHoursWorked = Math.round(attendance.reduce((s, a) => s + (a.hoursWorked || 0), 0) * 100) / 100;
      const totalOvertimeHours = Math.round(attendance.reduce((s, a) => s + (a.overtimeHours || 0), 0) * 100) / 100;
      const overtimePay = Math.round(totalOvertimeHours * attendanceSettings.otRatePerHour * 100) / 100;

      const advanceRows = advancesByEmployee.get(employee.id) || [];

      // Piece-rate pay is additive to salary, not a replacement — a hybrid tailor's own
      // salaryRate can be ₹0 (pure piece-rate) or nonzero (base + piece-rate on top).
      const piecePay = employee.pieceRateEligible ? computePieceRatePay(employee.id, confirmedOrders, confirmedWorkOrders) : 0;

      // C-3: Only link advances that fit within the gross pay + overtime + piece-rate budget.
      // Excess advances roll forward to the next payroll run instead of
      // being silently written off.
      let budgetLeft = grossPay + overtimePay + piecePay;
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

      const netPay = Math.max(0, Math.round((grossPay + overtimePay + piecePay - actualDeductions) * 100) / 100);

      const rowKey = employee.id;
      payslipRows.push({
        payroll_run_id: runId,
        employee_id: employee.id,
        present_days: counts.presentDays,
        absent_days: counts.absentDays,
        half_days: counts.halfDays,
        leave_days: counts.leaveDays,
        gross_pay: grossPay,
        piece_rate_pay: piecePay,
        deductions: actualDeductions,
        net_pay: netPay,
        hours_worked: totalHoursWorked,
        overtime_hours: totalOvertimeHours,
        overtime_pay: overtimePay,
        status: "draft",
      });
      advanceLinkMap.set(rowKey, advancesToLink);
    }

    // Batch insert all payslips — either all succeed or we clean up and fail.
    const { data: insertedPayslips, error: payslipError } = await db
      .from("payslips")
      .insert(payslipRows)
      .select("id, employee_id");
    if (payslipError) throw payslipError;

    // Link advances to their payslips.
    for (const ps of insertedPayslips || []) {
      const ids = advanceLinkMap.get(ps.employee_id) || [];
      if (ids.length > 0) {
        await db.from("employee_advances").update({ payslip_id: ps.id }).in("id", ids);
      }
    }

    // Mark as paid ONLY the orders/work-orders whose payables actually landed on a payslip in
    // this run — i.e. whose tailor is a piece-rate employee included here. Previously this
    // stamped every confirmed row shop-wide, so running payroll for a subset of staff silently
    // marked absent tailors' earnings as paid; because every future run filters on
    // piece_rate_paid_at IS NULL, that money became unrecoverable and unpayable.
    const paidEmployeeIds = new Set(employees.filter((e) => e.pieceRateEligible).map((e) => e.id));
    const paidOrderIds = confirmedOrders
      .filter((o) => (o.garments || []).some((g) => g.tailor && paidEmployeeIds.has(g.tailor) && (g.payableAmount || 0) > 0))
      .map((o) => o.id);
    const paidWoIds = confirmedWorkOrders.filter((w) => w.tailor && paidEmployeeIds.has(w.tailor)).map((w) => w.id);
    const nowIso = new Date().toISOString();
    if (paidOrderIds.length > 0) {
      await db.from("orders").update({ piece_rate_paid_at: nowIso }).in("id", paidOrderIds);
    }
    if (paidWoIds.length > 0) {
      await db.from("work_orders").update({ piece_rate_paid_at: nowIso }).in("id", paidWoIds);
    }
  } catch (err) {
    // Clean up the run header so the admin gets a clean slate.
    await db.from("payroll_runs").delete().eq("id", runId);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Payroll run failed" }, { status: 500 });
  }

  await logAction(supabase, user.email, `Payroll run generated: ${periodStart} to ${periodEnd} (${employeeCount} employees)`);
  return NextResponse.json({ ok: true, runId });
}
