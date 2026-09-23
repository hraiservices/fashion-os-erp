"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Permissions } from "@/lib/permissions";

export interface EmployeeDashboardAccess {
  enabled: boolean;
  role: string | null;
  custom_permissions: Partial<Permissions> | null;
}

/** Reads the current dashboard-access state for one employee — GET /api/employees/[id]/dashboard-access.
 *  Used by the Users & Access wizard when editing an employee-linked login. */
export function useEmployeeDashboardAccess(employeeId: string | null) {
  return useQuery({
    queryKey: ["employee-dashboard-access", employeeId],
    queryFn: async (): Promise<EmployeeDashboardAccess> => {
      const res = await fetch(`/api/employees/${employeeId}/dashboard-access`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load dashboard access");
      return data;
    },
    enabled: !!employeeId,
  });
}

/** Enables/updates or removes dashboard access for an employee — POST /api/employees/[id]/dashboard-access.
 *  This is the single call that creates the underlying login (synthetic email + user_roles row)
 *  the first time, or updates role/permissions on subsequent calls — see that route's own
 *  comment for the full mechanism. Passing enabled:false unlinks without deleting the login. */
export function useSetEmployeeDashboardAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      employeeId,
      enabled,
      role,
      custom,
      mobile,
    }: {
      employeeId: string;
      enabled: boolean;
      role?: string;
      custom?: Partial<Permissions>;
      mobile?: string;
    }) => {
      const res = await fetch(`/api/employees/${employeeId}/dashboard-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, role, custom, mobile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save dashboard access");
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["employee-dashboard-access", vars.employeeId] });
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}
