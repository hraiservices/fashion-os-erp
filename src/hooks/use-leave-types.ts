"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeaveType } from "@/lib/types";

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: ["leave-types"],
    queryFn: () => sendJson<{ leaveTypes: LeaveType[] }>("/api/leave-types", "GET").then((d) => d.leaveTypes),
    staleTime: 30_000,
  });
}

export function useActiveLeaveTypes() {
  const { data, ...rest } = useLeaveTypes();
  return { data: (data || []).filter((t) => t.active), ...rest };
}

export interface CreateLeaveTypeInput {
  name: string;
  annualDays: number;
  paid: boolean;
  carryForward: boolean;
  maxCarryForwardDays?: number | null;
}

export function useCreateLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeaveTypeInput) => sendJson<{ leaveType: LeaveType }>("/api/leave-types", "POST", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-types"] }),
  });
}

export function useUpdateLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<CreateLeaveTypeInput> & { active?: boolean }) =>
      sendJson<{ leaveType: LeaveType }>(`/api/leave-types/${id}`, "PATCH", patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-types"] }),
  });
}

export function useDeleteLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sendJson<{ ok: true; deactivated: boolean }>(`/api/leave-types/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave-types"] }),
  });
}
