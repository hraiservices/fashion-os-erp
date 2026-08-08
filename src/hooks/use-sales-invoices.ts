"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapSalesInvoiceRow, type SalesInvoice } from "@/lib/types";
import { deriveInvoiceBalance, invoicePaymentStatus, type InvoicePaymentStatus } from "@/lib/sales";

export interface SalesInvoiceWithBalance extends SalesInvoice {
  paidTotal: number;
  creditsTotal: number;
  balance: number;
  paymentStatus: InvoicePaymentStatus;
  /** Date of the most recent payment against this invoice, if any — used for "avg days to get paid". */
  lastPaymentDate: string | null;
}

async function fetchInvoicesEnriched(): Promise<SalesInvoiceWithBalance[]> {
  const supabase = createClient();
  const [{ data: invoices, error: invError }, { data: payments, error: payError }, { data: credits, error: credError }] = await Promise.all([
    supabase.from("sales_invoices").select("*").order("invoice_date", { ascending: false }),
    supabase.from("sales_payments").select("*"),
    supabase.from("sales_credit_notes").select("*"),
  ]);
  if (invError) throw invError;
  if (payError) throw payError;
  if (credError) throw credError;

  const paidByInvoice = new Map<string, number>();
  const lastPaymentByInvoice = new Map<string, string>();
  (payments || []).forEach((p) => {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) || 0) + p.amount);
    const existing = lastPaymentByInvoice.get(p.invoice_id);
    if (!existing || p.date > existing) lastPaymentByInvoice.set(p.invoice_id, p.date);
  });

  const creditsByInvoice = new Map<string, number>();
  (credits || []).forEach((c) => creditsByInvoice.set(c.invoice_id, (creditsByInvoice.get(c.invoice_id) || 0) + c.total));

  return (invoices || []).map((row) => {
    const invoice = mapSalesInvoiceRow(row);
    const paidTotal = paidByInvoice.get(invoice.id) || 0;
    const creditsTotal = creditsByInvoice.get(invoice.id) || 0;
    return {
      ...invoice,
      paidTotal,
      creditsTotal,
      balance: deriveInvoiceBalance(invoice.total, creditsTotal, paidTotal),
      paymentStatus: invoicePaymentStatus(invoice.total, creditsTotal, paidTotal),
      lastPaymentDate: lastPaymentByInvoice.get(invoice.id) || null,
    };
  });
}

export function useSalesInvoices() {
  return useQuery({
    queryKey: ["sales-invoices"],
    queryFn: fetchInvoicesEnriched,
    staleTime: 15_000,
  });
}

export function useSalesInvoice(id: string) {
  return useQuery({
    queryKey: ["sales-invoice", id],
    queryFn: async () => {
      const all = await fetchInvoicesEnriched();
      return all.find((i) => i.id === id) || null;
    },
    enabled: !!id,
  });
}
