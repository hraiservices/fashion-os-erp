"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeaveBalanceSummary } from "@/lib/types";

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function useEmployeeLeaveBalance(employeeId: string, year?: number) {
  return useQuery({
    queryKey: ["leave-balance", employeeId, year ?? "current"],
    queryFn: () =>
      sendJson<{ year: number; balances: LeaveBalanceSummary[] }>(`/api/employees/${employeeId}/leave-balance${year ? `?year=${year}` : ""}`, "GET"),
    enabled: !!employeeId,
    staleTime: 15_000,
  });
}

export function useAdjustLeaveBalance(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { leaveTypeId: string; year: number; days: number; reason: string }) =>
      sendJson<{ adjustment: unknown }>(`/api/employees/${employeeId}/leave-balance/adjust`, "POST", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-balance", employeeId] }),
  });
}
