"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

interface SaveWarehouseInput {
  id?: string;
  name: string;
  address: string;
  isDefault: boolean;
  active: boolean;
  userEmail?: string;
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function useSaveWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveWarehouseInput) => (await apiPost<{ warehouse: { id: string } }>("/api/inventory/warehouses", input)).warehouse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["warehouse"] });
    },
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string; userEmail?: string }) => apiDelete<{ ok: true }>(`/api/inventory/warehouses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
  });
}
