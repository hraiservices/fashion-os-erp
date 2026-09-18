"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPayrollRunRow, mapPayslipRow, mapEmployeeAdvanceRow, type Payslip, type PayrollRun } from "@/lib/types";

async function fetchPayrollRuns() {
  const supabase = createClient();
  const { data, error } = await supabase.from("payroll_runs").select("*").order("period_start", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapPayrollRunRow);
}

export function usePayrollRuns() {
  return useQuery({
    queryKey: ["payroll-runs"],
    queryFn: fetchPayrollRuns,
    staleTime: 15_000,
  });
}

async function fetchPayrollRun(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("payroll_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapPayrollRunRow(data) : null;
}

export function usePayrollRun(id: string) {
  return useQuery({
    queryKey: ["payroll-run", id],
    queryFn: () => fetchPayrollRun(id),
    enabled: !!id,
  });
}

async function fetchPayslipsForRun(runId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("payslips").select("*").eq("payroll_run_id", runId);
  if (error) throw error;
  return (data || []).map(mapPayslipRow);
}

export function usePayslipsForRun(runId: string) {
  return useQuery({
    queryKey: ["payslips", "run", runId],
    queryFn: () => fetchPayslipsForRun(runId),
    enabled: !!runId,
  });
}

async function fetchAllPayslips() {
  const supabase = createClient();
  const { data, error } = await supabase.from("payslips").select("*");
  if (error) throw error;
  return (data || []).map(mapPayslipRow);
}

/** Every payslip ever generated, across all runs — feeds the Salary Report (join against usePayrollRuns() by payrollRunId for period dates). */
export function useAllPayslips() {
  return useQuery({
    queryKey: ["payslips", "all"],
    queryFn: fetchAllPayslips,
    staleTime: 15_000,
  });
}

async function fetchAdvancesForEmployee(employeeId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("employee_advances").select("*").eq("employee_id", employeeId).order("date", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapEmployeeAdvanceRow);
}

export function useAdvancesForEmployee(employeeId: string) {
  return useQuery({
    queryKey: ["employee-advances", employeeId],
    queryFn: () => fetchAdvancesForEmployee(employeeId),
    enabled: !!employeeId,
  });
}

export interface BulkAdvanceCandidate {
  id: string;
  name: string;
  role: string;
  pieceRateEligible: boolean;
  /** Most this employee can be advanced right now, or null if they're not piece-rate eligible
   *  (salaried employees have no cap here — a manager judgment call). */
  pieceRateCap: number | null;
  outstandingAdvances: number;
}

async function fetchBulkAdvanceCandidates(): Promise<BulkAdvanceCandidate[]> {
  const res = await fetch("/api/employees/advances/bulk");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load employees");
  return data.employees;
}

/** Every active employee, with the context the Weekly Advances screen needs before anyone
 *  types an amount — not cached long, since an outstanding-advance total or a piece-rate cap
 *  can change the moment someone else records a payslip or confirms a payable. */
export function useBulkAdvanceCandidates() {
  return useQuery({
    queryKey: ["employee-advances", "bulk-candidates"],
    queryFn: fetchBulkAdvanceCandidates,
    staleTime: 5_000,
  });
}

async function fetchMyPayslips(): Promise<{ payslips: Payslip[]; runs: PayrollRun[] }> {
  const res = await fetch("/api/payroll/my-payslips");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load payslips");
  return data;
}

/** The logged-in staff member's own payslips (scoped server-side to their linked employee
 *  record) — for the "My Payslips" self-service page, not payroll administration. */
export function useMyPayslips() {
  return useQuery({
    queryKey: ["payslips", "mine"],
    queryFn: fetchMyPayslips,
    staleTime: 15_000,
  });
}
