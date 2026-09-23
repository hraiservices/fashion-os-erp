"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

async function fetchCreditBalance(mobile: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.from("customer_credit_balances").select("balance").eq("customer_mobile", mobile).maybeSingle();
  if (error) throw error;
  return data?.balance || 0;
}

/** Available customer-credit balance (supabase/migrations/add_customer_credit_ledger.sql) —
 *  usable against either a stitching order or a sales invoice on the Record Payment page. */
export function useCustomerCredit(mobile: string | null | undefined) {
  return useQuery({
    queryKey: ["customer-credit", mobile],
    queryFn: () => fetchCreditBalance(mobile!),
    enabled: !!mobile,
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
  mobile: string;
  amount: number;
  note?: string;
}

/** Issues new credit (a payment's excess amount received). */
export function useIssueCustomerCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mobile, ...body }: CreditMutationInput) => apiPost<{ balance: number }>(`/api/customers/${mobile}/credit`, { action: "issue", ...body }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["customer-credit", vars.mobile] }),
  });
}

/** Redeems existing credit (applied toward a new payment). */
export function useRedeemCustomerCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mobile, ...body }: CreditMutationInput) => apiPost<{ balance: number }>(`/api/customers/${mobile}/credit`, { action: "redeem", ...body }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["customer-credit", vars.mobile] }),
  });
}
