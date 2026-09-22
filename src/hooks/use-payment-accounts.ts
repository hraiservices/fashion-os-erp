"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface PaymentAccount {
  id: string;
  name: string;
  type: "cash" | "bank";
  isDefault: boolean;
}

async function fetchPaymentAccounts(): Promise<PaymentAccount[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("payment_accounts").select("*").order("name");
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, name: r.name, type: r.type, isDefault: r.is_default }));
}

/** "Deposit To" options for the Record Payment page (supabase/migrations/add_payment_deposit_account.sql). */
export function usePaymentAccounts() {
  return useQuery({
    queryKey: ["payment-accounts"],
    queryFn: fetchPaymentAccounts,
    staleTime: 60_000,
  });
}
