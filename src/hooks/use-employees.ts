"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapEmployeeRow, type Employee, type EmployeeRow } from "@/lib/types";
import { useCurrentUser } from "@/hooks/use-current-user";

// Explicit column list — deliberately excludes pin_hash. It's a bcrypt hash of a 4-6 digit
// PIN, low enough entropy that a leaked hash is realistically brute-forceable offline, so it
// must never reach the browser at all (RLS lets any authenticated staff member read the
// employees table, so "just don't display it" isn't enough — it can't be in the payload).
const EMPLOYEE_COLUMNS_BASE =
  "id, name, mobile, role, employment_type, commission_type, commission_rate, active, joined_date, notes, location_id, manager_id, photo_url, created_at, updated_at";

/**
 * Salary comes from the server, everything else comes straight from the browser.
 *
 * salary_type/salary_rate/piece_rate_eligible are not readable by `authenticated` at all any
 * more (lockdown_employee_salary_columns.sql) — asking for them here would fail the whole query,
 * not just omit them. Callers who hold managePayroll get them from GET /api/employees, which
 * checks the permission server-side and reads with the service-role client. Everyone else reads
 * the directory columns directly, which is what the tailor dropdown and the order form need.
 *
 * mapEmployeeRow defaults absent salary fields to 0/"monthly", so the non-salary path degrades
 * to "no salary shown" rather than crashing.
 */
async function fetchEmployees(canSeeSalary: boolean) {
  if (canSeeSalary) {
    const res = await fetch("/api/employees");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Could not load employees");
    return body.employees as Employee[];
  }

  const supabase = createClient();
  const { data, error } = await supabase.from("employees").select(EMPLOYEE_COLUMNS_BASE).order("name");
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
  // One employee, same split as the list above. The salary path reuses the list endpoint rather
  // than adding a second route — the staff list is small and already cached by react-query.
  if (canSeeSalary) {
    const all = await fetchEmployees(true);
    return all.find((e) => e.id === id) ?? null;
  }

  const supabase = createClient();
  const { data, error } = await supabase.from("employees").select(EMPLOYEE_COLUMNS_BASE).eq("id", id).maybeSingle();
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

/** Active tailors, sourced from Employees — replaces the old app_settings "tailors" list as the
 *  Tailor dropdown's source. Returns full Employee records (id + name) rather than just names —
 *  every tailor field in the app (order, garment, work order) stores an employee id now, not a
 *  free-text name, so callers select on `id` and display `name`. */
export function useActiveTailors() {
  const { data: employees, ...rest } = useEmployees();
  const tailors = (employees || []).filter((e) => e.active && e.role.toLowerCase() === "tailor");
  return { data: tailors, ...rest };
}

/** Resolves an employee id stored in a tailor field back to a display name. Falls back to the
 *  raw value unchanged for anything that doesn't match a known employee — covers legacy
 *  free-text tailor values from before the id upgrade that the backfill migration couldn't
 *  match, so the UI degrades to showing the old name rather than a blank or a stray id. */
export function useTailorName(): (id: string) => string {
  const { data: employees } = useEmployees();
  const byId = new Map((employees || []).map((e) => [e.id, e.name]));
  return (id: string) => (id ? byId.get(id) || id : "");
}
