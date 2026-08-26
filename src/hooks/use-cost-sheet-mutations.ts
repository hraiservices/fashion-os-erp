"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LineItem, TailorLineItem, ProfitConfig } from "@/lib/cost-sheet";

interface SaveCostSheetInput {
  id?: string;
  cost_sheet_no: string;
  date: string;
  customer_name: string;
  customer_mobile: string;
  product_name: string;
  category: string;
  notes: string;
  status: "draft" | "final";
  materials: LineItem[];
  tailors: TailorLineItem[];
  overheads: LineItem[];
  profit: ProfitConfig;
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

/** Previously ran entirely client-side with no permission check — see the API route's comment. */
export function useSaveCostSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCostSheetInput) => apiPost<{ id: string; totals: unknown }>("/api/cost-sheets", input),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["cost-sheets"] });
      qc.invalidateQueries({ queryKey: ["cost-sheet", result.id] });
    },
  });
}

export function useDeleteCostSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; userEmail?: string }) => apiDelete<{ ok: true }>(`/api/cost-sheets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cost-sheets"] });
    },
  });
}
