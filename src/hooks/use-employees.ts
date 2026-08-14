"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapEmployeeRow, type EmployeeRow } from "@/lib/types";

// Explicit column list — deliberately excludes pin_hash. It's a bcrypt hash of a 4-6 digit
// PIN, low enough entropy that a leaked hash is realistically brute-forceable offline, so it
// must never reach the browser at all (RLS lets any authenticated staff member read the
// employees table, so "just don't display it" isn't enough — it can't be in the payload).
const EMPLOYEE_COLUMNS =
  "id, name, mobile, role, employment_type, commission_type, commission_rate, active, joined_date, notes, salary_type, salary_rate, location_id, created_at, updated_at";

async function fetchEmployees() {
  const supabase = createClient();
  const { data, error } = await supabase.from("employees").select(EMPLOYEE_COLUMNS).order("name");
  if (error) throw error;
  return (data || []).map((r) => mapEmployeeRow({ ...r, pin_hash: null } as EmployeeRow));
}

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
    staleTime: 30_000,
  });
}

async function fetchEmployee(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("employees").select(EMPLOYEE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapEmployeeRow({ ...data, pin_hash: null } as EmployeeRow) : null;
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: ["employee", id],
    queryFn: () => fetchEmployee(id),
    enabled: !!id,
  });
}

/** Active tailors, sourced from Employees — replaces the old app_settings "tailors" list as the Tailor dropdown's source. */
export function useActiveTailorNames() {
  const { data: employees, ...rest } = useEmployees();
  const tailors = (employees || []).filter((e) => e.active && e.role.toLowerCase() === "tailor").map((e) => e.name);
  return { data: tailors, ...rest };
}
