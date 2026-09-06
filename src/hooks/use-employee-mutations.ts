"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CommissionType, Employee, SalaryType } from "@/lib/types";

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
  pieceRateEligible?: boolean;
  locationId?: string | null;
  photoUrl?: string | null;
  userEmail?: string;
}

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/**
 * Save (create/update) an employee. Routed through POST /api/employees so manageEmployees
 * (and, for salary fields, managePayroll) is enforced server-side — this used to write
 * straight to Supabase, making the permission UI-only.
 */
export function useSaveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userEmail: _ignored, ...input }: SaveEmployeeInput) => sendJson<{ employee: Employee }>("/api/employees", "POST", input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee"] });
      return data;
    },
  });
}

/** Delete an employee. Routed through DELETE /api/employees/[id] — see useSaveEmployee's comment. */
export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string; userEmail?: string }) => sendJson<{ ok: true }>(`/api/employees/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}
