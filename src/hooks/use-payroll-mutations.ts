"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";

function invalidatePayroll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["payroll-runs"] });
  qc.invalidateQueries({ queryKey: ["payroll-run"] });
  qc.invalidateQueries({ queryKey: ["payslips"] });
  qc.invalidateQueries({ queryKey: ["employee-advances"] });
}

async function apiJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/**
 * Run payroll via the server route.
 *
 * C-1: Permission check (managePayroll) is now server-enforced.
 * C-3: Advance deductions no longer silently forgive shortfalls.
 * C-4: Duplicate period runs rejected by DB UNIQUE constraint + preflight check.
 * C-5: Monthly employees with no attendance records get ₹0, not full salary.
 * H-8: Actor email resolved from session cookie, not client body.
 */
export function useRunPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodStart, periodEnd }: { periodStart: string; periodEnd: string; userEmail?: string }) =>
      apiJson<{ ok: true; runId: string }>("/api/payroll/run", "POST", { periodStart, periodEnd }),
    onSuccess: () => invalidatePayroll(qc),
  });
}

/**
 * Delete a payroll run. Finalized runs are rejected server-side.
 * Cascades to payslips (FK ON DELETE CASCADE) and un-links advances (ON DELETE SET NULL).
 */
export function useDeletePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; userEmail?: string }) =>
      apiJson<{ ok: true }>(`/api/payroll/run/${id}`, "DELETE"),
    onSuccess: () => invalidatePayroll(qc),
  });
}

export function useFinalizePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; userEmail?: string }) =>
      apiJson<{ ok: true }>(`/api/payroll/run/${id}`, "PATCH", { action: "finalize" }),
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
