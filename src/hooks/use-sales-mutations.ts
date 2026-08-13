"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import { computeLineItemsTotal, type SalesLineItem, type QuoteStatus } from "@/lib/sales";
import { computeGst, type GstType } from "@/lib/gst";
import { computeInvoiceTotals, type DiscountType } from "@/lib/invoice-totals";
import type { InvoiceDocStatus } from "@/lib/types";

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["sales-quotations"] });
  qc.invalidateQueries({ queryKey: ["sales-quotation"] });
  qc.invalidateQueries({ queryKey: ["sales-invoices"] });
  qc.invalidateQueries({ queryKey: ["sales-invoice"] });
  qc.invalidateQueries({ queryKey: ["sales-payments"] });
  qc.invalidateQueries({ queryKey: ["sales-credit-notes"] });
  qc.invalidateQueries({ queryKey: ["products"] });
  qc.invalidateQueries({ queryKey: ["inventory-ledger"] });
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

// ── Quotations (planning documents — no stock impact) ───────────────────────

interface SaveQuotationInput {
  id?: string;
  quoteNumber: string;
  customerMobile: string;
  customerName: string;
  date: string;
  validUntil?: string | null;
  status: QuoteStatus;
  items: SalesLineItem[];
  gstType: GstType;
  taxRate: number;
  notes: string;
  userEmail?: string;
}

export function useSaveQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveQuotationInput) => {
      const supabase = createClient();
      const isNew = !input.id;
      const taxableAmount = computeLineItemsTotal(input.items);
      const gst = computeGst(taxableAmount, input.taxRate, input.gstType);

      const { data, error } = await supabase
        .from("sales_quotations")
        .upsert({
          id: input.id,
          quote_number: input.quoteNumber,
          customer_mobile: input.customerMobile,
          customer_name: input.customerName,
          date: input.date,
          valid_until: input.validUntil || null,
          status: input.status,
          items: input.items as never,
          taxable_amount: gst.taxableAmount,
          gst_type: input.gstType,
          tax_rate: input.taxRate,
          cgst: gst.cgst,
          sgst: gst.sgst,
          igst: gst.igst,
          total: gst.total,
          notes: input.notes.trim(),
          created_by: input.userEmail || null,
        })
        .select()
        .single();
      if (error) throw error;
      await logAction(supabase, input.userEmail, isNew ? `Quotation created: ${input.quoteNumber}` : `Quotation updated: ${input.quoteNumber}`, null, `₹${gst.total}`);
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetQuotationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, quoteNumber, status, userEmail }: { id: string; quoteNumber: string; status: QuoteStatus; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("sales_quotations").update({ status }).eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Quotation ${quoteNumber} marked ${status}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Invoices (selling stock happens here) ───────────────────────────────────

interface SaveInvoiceInput {
  id?: string;
  invoiceNumber: string;
  customerMobile: string;
  customerName: string;
  quoteId?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  items: SalesLineItem[];
  subject: string;
  shippingCharges: number;
  discountType: DiscountType;
  discountValue: number;
  gstType: GstType;
  taxRate: number;
  docStatus: InvoiceDocStatus;
  terms: string;
  notes: string;
  userEmail?: string;
}

/**
 * Create or update a sales invoice via the server API route.
 *
 * H-3: The API route blocks financial edits (item changes) if any payments have
 * been recorded — prevents replace_inventory_ledger from silently crediting
 * stock that was genuinely sold and paid for.
 *
 * C-1: Permission check (manageSales) is now server-enforced, not UI-only.
 *
 * H-8: created_by is resolved from the server session, not the client body.
 */
export function useSaveInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userEmail: _ignored, ...input }: SaveInvoiceInput) => {
      const res = await apiPost<{ ok: true; data: { id: string } }>("/api/sales/invoices", input);
      return res.data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Toggles the lightweight Draft/Sent label — purely a "have I sent this yet" marker, no stock impact. */
export function useSetInvoiceDocStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, invoiceNumber, docStatus, userEmail }: { id: string; invoiceNumber: string; docStatus: InvoiceDocStatus; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("sales_invoices").update({ doc_status: docStatus }).eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Invoice ${invoiceNumber} marked ${docStatus}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/**
 * Delete a sales invoice via the server route.
 *
 * H-3: The API route blocks delete if payments or credit notes exist.
 * C-1: Permission enforced server-side.
 */
export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; invoiceNumber: string; userEmail?: string }) =>
      apiDelete<{ ok: true }>(`/api/sales/invoices/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Payments Received ────────────────────────────────────────────────────

interface RecordSalesPaymentInput {
  invoiceId: string;
  customerMobile: string;
  invoiceNumber: string;
  amount: number;
  method: string;
  date: string;
  note: string;
  posSessionId?: string | null;
  userEmail?: string;
}

/**
 * Record a sales payment via the server route.
 *
 * H-1: The API route checks the outstanding balance and rejects overpayments.
 * C-1: Permission enforced server-side.
 * H-8: created_by from server session.
 */
export function useRecordSalesPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userEmail: _ignored, ...input }: RecordSalesPaymentInput) =>
      apiPost<{ ok: true }>("/api/sales/payments", input),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Deletes a single payment record. Permission enforced server-side. */
export function useDeleteSalesPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; amount: number; invoiceNumber: string; userEmail?: string }) =>
      apiDelete<{ ok: true }>(`/api/sales/payments/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Bulk-delete payment records. */
export function useBulkDeleteSalesPayments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, userEmail }: { ids: string[]; userEmail?: string }) => {
      await Promise.all(ids.map((id) => apiDelete(`/api/sales/payments/${id}`)));
    },
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Credit Notes (returns — restocks and reduces the amount owed) ───────────

interface RaiseSalesCreditInput {
  invoiceId: string;
  invoiceNumber: string;
  customerMobile: string;
  creditNumber: string;
  date: string;
  items: SalesLineItem[];
  reason: string;
  notes: string;
  userEmail?: string;
}

/**
 * Raise a sales credit note via the server route.
 *
 * H-2: The API route caps the credit at the invoice total minus prior credits,
 * preventing free-money exploits and phantom stock creation.
 * C-1: Permission enforced server-side.
 */
export function useRaiseSalesCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userEmail: _ignored, ...input }: RaiseSalesCreditInput) =>
      apiPost<{ ok: true; id: string }>("/api/sales/credit-notes", input),
    onSuccess: () => invalidateAll(qc),
  });
}
