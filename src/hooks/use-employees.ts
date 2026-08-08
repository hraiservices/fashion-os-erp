"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapEmployeeRow } from "@/lib/types";

async function fetchEmployees() {
  const supabase = createClient();
  const { data, error } = await supabase.from("employees").select("*").order("name");
  if (error) throw error;
  return (data || []).map(mapEmployeeRow);
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
  const { data, error } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapEmployeeRow(data) : null;
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
