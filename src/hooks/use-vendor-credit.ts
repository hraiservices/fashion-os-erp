"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

async function fetchCreditBalance(vendorId: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.from("vendor_credit_balances").select("balance").eq("vendor_id", vendorId).maybeSingle();
  if (error) throw error;
  return data?.balance || 0;
}

/** Available vendor-credit balance (supabase/migrations/add_vendor_credit_ledger.sql) — usable
 *  against any of that vendor's open bills on the vendor Record Payment page. */
export function useVendorCredit(vendorId: string | null | undefined) {
  return useQuery({
    queryKey: ["vendor-credit", vendorId],
    queryFn: () => fetchCreditBalance(vendorId!),
    enabled: !!vendorId,
    staleTime: 10_000,
  });
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

interface CreditMutationInput {
  vendorId: string;
  amount: number;
  note?: string;
}

/** Issues new credit (a payment's excess amount paid). */
export function useIssueVendorCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vendorId, ...body }: CreditMutationInput) => apiPost<{ balance: number }>(`/api/purchases/vendors/${vendorId}/credit`, { action: "issue", ...body }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["vendor-credit", vars.vendorId] }),
  });
}

/** Redeems existing credit (applied toward a new payment). */
export function useRedeemVendorCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vendorId, ...body }: CreditMutationInput) => apiPost<{ balance: number }>(`/api/purchases/vendors/${vendorId}/credit`, { action: "redeem", ...body }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["vendor-credit", vars.vendorId] }),
  });
}
