"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapEmployeeRow, type EmployeeRow } from "@/lib/types";
import { useCurrentUser } from "@/hooks/use-current-user";

// Explicit column list — deliberately excludes pin_hash. It's a bcrypt hash of a 4-6 digit
// PIN, low enough entropy that a leaked hash is realistically brute-forceable offline, so it
// must never reach the browser at all (RLS lets any authenticated staff member read the
// employees table, so "just don't display it" isn't enough — it can't be in the payload).
const EMPLOYEE_COLUMNS_BASE =
  "id, name, mobile, role, employment_type, commission_type, commission_rate, active, joined_date, notes, location_id, manager_id, created_at, updated_at";
const EMPLOYEE_COLUMNS_WITH_SALARY = `${EMPLOYEE_COLUMNS_BASE}, salary_type, salary_rate`;

/** salary_type/salary_rate are only ever included in the query when the caller holds
 *  managePayroll — previously every logged-in user's fetch included every employee's salary
 *  in the network payload regardless of role, even though the UI correctly hid the column for
 *  everyone else. mapEmployeeRow defaults absent salary fields to 0/"monthly", so omitting the
 *  columns degrades gracefully rather than crashing. */
async function fetchEmployees(canSeeSalary: boolean) {
  const supabase = createClient();
  const { data, error } = await supabase.from("employees").select(canSeeSalary ? EMPLOYEE_COLUMNS_WITH_SALARY : EMPLOYEE_COLUMNS_BASE).order("name");
  if (error) throw error;
  return ((data as Partial<EmployeeRow>[]) || []).map((r) => mapEmployeeRow({ ...r, pin_hash: null } as EmployeeRow));
}

export function useEmployees() {
  const { data: user } = useCurrentUser();
  const canSeeSalary = !!user?.perms.managePayroll;
  return useQuery({
    queryKey: ["employees", canSeeSalary],
    queryFn: () => fetchEmployees(canSeeSalary),
    staleTime: 30_000,
  });
}

async function fetchEmployee(id: string, canSeeSalary: boolean) {
  const supabase = createClient();
  const { data, error } = await supabase.from("employees").select(canSeeSalary ? EMPLOYEE_COLUMNS_WITH_SALARY : EMPLOYEE_COLUMNS_BASE).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapEmployeeRow({ ...(data as Partial<EmployeeRow>), pin_hash: null } as EmployeeRow) : null;
}

export function useEmployee(id: string) {
  const { data: user } = useCurrentUser();
  const canSeeSalary = !!user?.perms.managePayroll;
  return useQuery({
    queryKey: ["employee", id, canSeeSalary],
    queryFn: () => fetchEmployee(id, canSeeSalary),
    enabled: !!id,
  });
}

/** Active tailors, sourced from Employees — replaces the old app_settings "tailors" list as the Tailor dropdown's source. */
export function useActiveTailorNames() {
  const { data: employees, ...rest } = useEmployees();
  const tailors = (employees || []).filter((e) => e.active && e.role.toLowerCase() === "tailor").map((e) => e.name);
  return { data: tailors, ...rest };
}
