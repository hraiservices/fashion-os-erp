"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPayrollRunRow, mapPayslipRow, mapEmployeeAdvanceRow } from "@/lib/types";

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
