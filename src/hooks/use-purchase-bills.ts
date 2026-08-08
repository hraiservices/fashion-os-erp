"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPurchaseBillRow, type PurchaseBill } from "@/lib/types";
import { deriveBillBalance, billPaymentStatus, type BillPaymentStatus } from "@/lib/purchases";

export interface PurchaseBillWithBalance extends PurchaseBill {
  paidTotal: number;
  creditsTotal: number;
  balance: number;
  paymentStatus: BillPaymentStatus;
  lastPaymentDate: string | null;
}

async function fetchBillsEnriched(): Promise<PurchaseBillWithBalance[]> {
  const supabase = createClient();
  const [{ data: bills, error: billError }, { data: payments, error: payError }, { data: credits, error: credError }] = await Promise.all([
    supabase.from("purchase_bills").select("*").order("bill_date", { ascending: false }),
    supabase.from("vendor_payments").select("*"),
    supabase.from("vendor_credits").select("*"),
  ]);
  if (billError) throw billError;
  if (payError) throw payError;
  if (credError) throw credError;

  const paidByBill = new Map<string, number>();
  const lastPaymentByBill = new Map<string, string>();
  (payments || []).forEach((p) => {
    paidByBill.set(p.bill_id, (paidByBill.get(p.bill_id) || 0) + p.amount);
    const current = lastPaymentByBill.get(p.bill_id);
    if (!current || p.date > current) lastPaymentByBill.set(p.bill_id, p.date);
  });

  const creditsByBill = new Map<string, number>();
  (credits || []).forEach((c) => {
    if (c.bill_id) creditsByBill.set(c.bill_id, (creditsByBill.get(c.bill_id) || 0) + c.total);
  });

  return (bills || []).map((row) => {
    const bill = mapPurchaseBillRow(row);
    const paidTotal = paidByBill.get(bill.id) || 0;
    const creditsTotal = creditsByBill.get(bill.id) || 0;
    return {
      ...bill,
      paidTotal,
      creditsTotal,
      balance: deriveBillBalance(bill.total, creditsTotal, paidTotal),
      paymentStatus: billPaymentStatus(bill.total, creditsTotal, paidTotal),
      lastPaymentDate: lastPaymentByBill.get(bill.id) || null,
    };
  });
}

export function usePurchaseBills() {
  return useQuery({
    queryKey: ["purchase-bills"],
    queryFn: fetchBillsEnriched,
    staleTime: 15_000,
  });
}

export function usePurchaseBill(id: string) {
  return useQuery({
    queryKey: ["purchase-bill", id],
    queryFn: async () => {
      const all = await fetchBillsEnriched();
      return all.find((b) => b.id === id) || null;
    },
    enabled: !!id,
  });
}
