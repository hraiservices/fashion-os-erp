"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Holiday } from "@/lib/types";

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function useHolidays(year?: number) {
  return useQuery({
    queryKey: ["holidays", year ?? "all"],
    queryFn: () => sendJson<{ holidays: Holiday[] }>(`/api/holidays${year ? `?year=${year}` : ""}`, "GET").then((d) => d.holidays),
    staleTime: 30_000,
  });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; date: string }) => sendJson<{ holiday: Holiday }>("/api/holidays", "POST", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sendJson<{ ok: true }>(`/api/holidays/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holidays"] }),
  });
}
