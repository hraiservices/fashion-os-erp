"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeaveRequest } from "@/lib/types";

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function useLeaveRequests(filters?: { employeeId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.employeeId) params.set("employeeId", filters.employeeId);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();

  return useQuery({
    queryKey: ["leave-requests", filters?.employeeId ?? "all", filters?.status ?? "all"],
    queryFn: () => sendJson<{ requests: LeaveRequest[] }>(`/api/leave-requests${qs ? `?${qs}` : ""}`, "GET").then((d) => d.requests),
    staleTime: 15_000,
  });
}

export interface CreateLeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  halfDay?: boolean;
  reason?: string;
}

/** Admin/manager recording a leave request on an employee's behalf. */
export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeaveRequestInput) => sendJson<{ request: LeaveRequest }>("/api/leave-requests", "POST", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-requests"] }),
  });
}

export function useApproveLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sendJson<{ request: LeaveRequest; skippedDates: string[] }>(`/api/leave-requests/${id}/approve`, "POST"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balance"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function useRejectLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => sendJson<{ request: LeaveRequest }>(`/api/leave-requests/${id}/reject`, "POST", { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-requests"] }),
  });
}
