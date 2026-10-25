"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Expense } from "@/lib/types";
import { rethrowFriendly } from "@/lib/error-message";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    rethrowFriendly(e);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function useExpenses() {
  return useQuery<Expense[]>({
    queryKey: ["expenses"],
    queryFn: async () => {
      const res = await fetch("/api/expenses");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load expenses");
      return (data.expenses ?? []) as Expense[];
    },
  });
}

/** Single expense, derived from the shared list cache — the API has no single-expense GET route. */
export function useExpense(id: string) {
  const { data, isLoading } = useExpenses();
  return { data: (data || []).find((e) => e.id === id), isLoading };
}

export interface CreateExpenseInput {
  date: string;
  category: string;
  description?: string;
  amount: number;
  payMethod: string;
  customerMobile?: string | null;
  customerName?: string | null;
  employeeId?: string | null;
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) =>
      postJson<{ expense: Expense }>("/api/expenses", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CreateExpenseInput & { id: string }) => {
      let res: Response;
      try {
        res = await fetch(`/api/expenses/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      } catch (e) {
        rethrowFriendly(e);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update expense");
      return data as { expense: Expense };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      let res: Response;
      try {
        res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      } catch (e) {
        rethrowFriendly(e);
      }
      if (!res.ok) throw new Error("Failed to delete expense");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

/** Deletes several expenses in one go — for the "select all" bulk-delete on the Expenses list. Reuses the single-delete route, fired in parallel. */
export function useBulkDeleteExpenses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.all(ids.map((id) => fetch(`/api/expenses/${id}`, { method: "DELETE" })));
      const failed = results.filter((r) => !r.ok).length;
      if (failed) throw new Error(`${failed} of ${ids.length} expense(s) failed to delete`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}
