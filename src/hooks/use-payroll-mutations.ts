"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

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

/** Mark a payslip paid. Routed through PATCH /api/payroll/payslips/[id] so managePayroll is
 *  enforced server-side — this used to be a direct browser-to-Supabase update with no
 *  permission check at all. */
export function useMarkPayslipPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => apiJson<{ ok: true }>(`/api/payroll/payslips/${id}`, "PATCH", { action: "mark_paid" }),
    onSuccess: () => invalidatePayroll(qc),
  });
}

/** Apply a manual bonus (positive amount) or deduction (negative amount) to a draft payslip,
 *  with a required note explaining why — e.g. a one-off bonus or a fine the attendance-based
 *  math has no way to express. Rejected server-side once the payslip is marked paid. */
export function useAdjustPayslip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: number; note: string }) =>
      apiJson<{ ok: true }>(`/api/payroll/payslips/${id}`, "PATCH", { action: "adjust", amount, note }),
    onSuccess: () => invalidatePayroll(qc),
  });
}

/** Record an advance. Routed through POST /api/employees/[id]/advances — same reasoning as
 *  useMarkPayslipPaid above. */
export function useAddAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, date, amount, note }: { employeeId: string; date: string; amount: number; note: string; userEmail?: string }) =>
      apiJson<{ ok: true }>(`/api/employees/${employeeId}/advances`, "POST", { date, amount, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-advances"] }),
  });
}

/** Delete an advance. Routed through DELETE /api/employees/advances/[id] — same reasoning. */
export function useDeleteAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => apiJson<{ ok: true }>(`/api/employees/advances/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-advances"] }),
  });
}
