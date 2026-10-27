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

// A growth safety net, not real pagination — see the identical comment in use-orders.ts.
const SAFETY_LIMIT = 20_000;

async function fetchInvoicesEnriched(): Promise<SalesInvoiceWithBalance[]> {
  const supabase = createClient();
  const [{ data: invoices, error: invError }, { data: payments, error: payError }, { data: credits, error: credError }] = await Promise.all([
    supabase.from("sales_invoices").select("*").order("invoice_date", { ascending: false }).limit(SAFETY_LIMIT),
    supabase.from("sales_payments").select("*").limit(SAFETY_LIMIT),
    supabase.from("sales_credit_notes").select("*").limit(SAFETY_LIMIT),
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

/** Scoped to the one invoice (+ its own payments/credit notes) by id, rather than
 *  fetchInvoicesEnriched()'s full-table fetch of every invoice/payment/credit-note in the
 *  shop — opening a single invoice detail page used to pull the entire dataset just to find
 *  one row in it. */
async function fetchInvoiceByIdEnriched(id: string): Promise<SalesInvoiceWithBalance | null> {
  const supabase = createClient();
  const [{ data: invoiceRow, error: invError }, { data: payments, error: payError }, { data: credits, error: credError }] = await Promise.all([
    supabase.from("sales_invoices").select("*").eq("id", id).maybeSingle(),
    supabase.from("sales_payments").select("*").eq("invoice_id", id),
    supabase.from("sales_credit_notes").select("*").eq("invoice_id", id),
  ]);
  if (invError) throw invError;
  if (payError) throw payError;
  if (credError) throw credError;
  if (!invoiceRow) return null;

  const invoice = mapSalesInvoiceRow(invoiceRow);
  const paidTotal = (payments || []).reduce((sum, p) => sum + p.amount, 0);
  const creditsTotal = (credits || []).reduce((sum, c) => sum + c.total, 0);
  const lastPaymentDate = (payments || []).reduce<string | null>((latest, p) => (!latest || p.date > latest ? p.date : latest), null);

  return {
    ...invoice,
    paidTotal,
    creditsTotal,
    balance: deriveInvoiceBalance(invoice.total, creditsTotal, paidTotal),
    paymentStatus: invoicePaymentStatus(invoice.total, creditsTotal, paidTotal),
    lastPaymentDate,
  };
}

export function useSalesInvoice(id: string) {
  return useQuery({
    queryKey: ["sales-invoice", id],
    queryFn: () => fetchInvoiceByIdEnriched(id),
    enabled: !!id,
  });
}
