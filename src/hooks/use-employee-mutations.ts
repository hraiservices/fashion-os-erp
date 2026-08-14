"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import type { CommissionType, SalaryType } from "@/lib/types";

// Excludes pin_hash — see the identical note in use-employees.ts. PIN setting itself goes
// through a dedicated server route (never this direct-to-Supabase mutation), specifically so
// the hash is never round-tripped back into a browser response.
const EMPLOYEE_COLUMNS =
  "id, name, mobile, role, employment_type, commission_type, commission_rate, active, joined_date, notes, salary_type, salary_rate, location_id, created_at, updated_at";

interface SaveEmployeeInput {
  id?: string;
  name: string;
  mobile: string;
  role: string;
  employmentType: string;
  commissionType: CommissionType;
  commissionRate: number;
  active: boolean;
  joinedDate: string | null;
  notes: string;
  salaryType?: SalaryType;
  salaryRate?: number;
  locationId?: string | null;
  userEmail?: string;
}

export function useSaveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveEmployeeInput) => {
      const supabase = createClient();
      const isNew = !input.id;
      const { data, error } = await supabase
        .from("employees")
        .upsert({
          id: input.id,
          name: input.name.trim(),
          mobile: input.mobile.trim(),
          role: input.role.trim(),
          employment_type: input.employmentType,
          commission_type: input.commissionType,
          commission_rate: input.commissionRate,
          active: input.active,
          joined_date: input.joinedDate || null,
          notes: input.notes.trim(),
          ...(input.salaryType ? { salary_type: input.salaryType } : {}),
          ...(input.salaryRate !== undefined ? { salary_rate: input.salaryRate } : {}),
          ...(input.locationId !== undefined ? { location_id: input.locationId } : {}),
        })
        .select(EMPLOYEE_COLUMNS)
        .single();
      if (error) throw error;
      await logAction(supabase, input.userEmail, isNew ? `Employee added: ${input.name}` : `Employee updated: ${input.name}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee"] });
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, userEmail }: { id: string; name: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Employee deleted: ${name}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}
