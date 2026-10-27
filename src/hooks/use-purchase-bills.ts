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

/** Scoped to the one bill (+ its own payments/credits) by id, rather than
 *  fetchBillsEnriched()'s full-table fetch of every bill/payment/credit in the shop — opening a
 *  single purchase-bill detail page used to pull the entire dataset just to find one row in it.
 *  Same fix as useSalesInvoice in src/hooks/use-sales-invoices.ts. */
async function fetchBillByIdEnriched(id: string): Promise<PurchaseBillWithBalance | null> {
  const supabase = createClient();
  const [{ data: billRow, error: billError }, { data: payments, error: payError }, { data: credits, error: credError }] = await Promise.all([
    supabase.from("purchase_bills").select("*").eq("id", id).maybeSingle(),
    supabase.from("vendor_payments").select("*").eq("bill_id", id),
    supabase.from("vendor_credits").select("*").eq("bill_id", id),
  ]);
  if (billError) throw billError;
  if (payError) throw payError;
  if (credError) throw credError;
  if (!billRow) return null;

  const bill = mapPurchaseBillRow(billRow);
  const paidTotal = (payments || []).reduce((sum, p) => sum + p.amount, 0);
  const creditsTotal = (credits || []).reduce((sum, c) => sum + c.total, 0);
  const lastPaymentDate = (payments || []).reduce<string | null>((latest, p) => (!latest || p.date > latest ? p.date : latest), null);

  return {
    ...bill,
    paidTotal,
    creditsTotal,
    balance: deriveBillBalance(bill.total, creditsTotal, paidTotal),
    paymentStatus: billPaymentStatus(bill.total, creditsTotal, paidTotal),
    lastPaymentDate,
  };
}

export function usePurchaseBill(id: string) {
  return useQuery({
    queryKey: ["purchase-bill", id],
    queryFn: () => fetchBillByIdEnriched(id),
    enabled: !!id,
  });
}
