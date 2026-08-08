"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import { computeGrossPay, countAttendance } from "@/lib/payroll";
import { mapEmployeeRow, mapAttendanceRow } from "@/lib/types";

function invalidatePayroll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["payroll-runs"] });
  qc.invalidateQueries({ queryKey: ["payroll-run"] });
  qc.invalidateQueries({ queryKey: ["payslips"] });
  qc.invalidateQueries({ queryKey: ["employee-advances"] });
}

/**
 * Generates one payslip per active employee for the given period: pulls their attendance
 * records in-range, computes gross pay via lib/payroll.ts, subtracts any not-yet-deducted
 * advances (dated on/before the period end), and links those advances to the new payslip so
 * they're never double-deducted in a later run.
 */
export function useRunPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ periodStart, periodEnd, userEmail }: { periodStart: string; periodEnd: string; userEmail?: string }) => {
      const supabase = createClient();

      const { data: runRow, error: runError } = await supabase.from("payroll_runs").insert({ period_start: periodStart, period_end: periodEnd, created_by: userEmail || null, status: "draft" }).select().single();
      if (runError) throw runError;
      const runId = runRow.id as string;

      const { data: employeeRows, error: empError } = await supabase.from("employees").select("*").eq("active", true);
      if (empError) throw empError;
      const employees = (employeeRows || []).map(mapEmployeeRow);

      for (const employee of employees) {
        const { data: attRows } = await supabase
          .from("employee_attendance")
          .select("*")
          .eq("employee_id", employee.id)
          .gte("date", periodStart)
          .lte("date", periodEnd);
        const attendance = (attRows || []).map(mapAttendanceRow);
        const counts = countAttendance(attendance);
        const grossPay = computeGrossPay(employee, periodStart, periodEnd, counts);

        const { data: advanceRows } = await supabase
          .from("employee_advances")
          .select("*")
          .eq("employee_id", employee.id)
          .is("payslip_id", null)
          .lte("date", periodEnd);
        const deductions = (advanceRows || []).reduce((s, a) => s + (a.amount || 0), 0);
        const netPay = Math.max(0, Math.round((grossPay - deductions) * 100) / 100);

        const { data: payslip, error: payslipError } = await supabase
          .from("payslips")
          .upsert(
            {
              payroll_run_id: runId,
              employee_id: employee.id,
              present_days: counts.presentDays,
              absent_days: counts.absentDays,
              half_days: counts.halfDays,
              leave_days: counts.leaveDays,
              gross_pay: grossPay,
              deductions,
              net_pay: netPay,
              status: "draft",
            },
            { onConflict: "payroll_run_id,employee_id" }
          )
          .select()
          .single();
        if (payslipError) throw payslipError;

        if ((advanceRows || []).length > 0) {
          await supabase
            .from("employee_advances")
            .update({ payslip_id: payslip.id })
            .in("id", (advanceRows || []).map((a) => a.id));
        }
      }

      await logAction(supabase, userEmail, `Payroll run generated: ${periodStart} to ${periodEnd} (${employees.length} employees)`);
      return runId;
    },
    onSuccess: () => invalidatePayroll(qc),
  });
}

export function useDeletePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userEmail }: { id: string; userEmail?: string }) => {
      const supabase = createClient();
      // Deleting the run cascades to its payslips (FK ON DELETE CASCADE), which in turn
      // un-links any advances that were deducted against them (ON DELETE SET NULL) — so a
      // mis-run draft can be safely discarded and regenerated.
      const { error } = await supabase.from("payroll_runs").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Payroll run deleted: ${id}`);
    },
    onSuccess: () => invalidatePayroll(qc),
  });
}

export function useFinalizePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userEmail }: { id: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("payroll_runs").update({ status: "finalized", finalized_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Payroll run finalized: ${id}`);
    },
    onSuccess: () => invalidatePayroll(qc),
  });
}

export function useMarkPayslipPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("payslips").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidatePayroll(qc),
  });
}

export function useAddAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, date, amount, note, userEmail }: { employeeId: string; date: string; amount: number; note: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("employee_advances").insert({ employee_id: employeeId, date, amount, note, created_by: userEmail || null });
      if (error) throw error;
      await logAction(supabase, userEmail, `Advance recorded: ₹${amount}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-advances"] }),
  });
}

export function useDeleteAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("employee_advances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-advances"] }),
  });
}
