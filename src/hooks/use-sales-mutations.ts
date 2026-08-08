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

export function useSaveInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveInvoiceInput) => {
      const supabase = createClient();
      const isNew = !input.id;
      const totals = computeInvoiceTotals(input.items, input.shippingCharges, input.discountType, input.discountValue, input.taxRate, input.gstType);

      const { data, error } = await supabase
        .from("sales_invoices")
        .upsert({
          id: input.id,
          invoice_number: input.invoiceNumber,
          customer_mobile: input.customerMobile,
          customer_name: input.customerName,
          quote_id: input.quoteId || null,
          invoice_date: input.invoiceDate,
          due_date: input.dueDate || null,
          items: input.items as never,
          subject: input.subject.trim(),
          shipping_charges: totals.shippingCharges,
          discount_type: input.discountType,
          discount_value: input.discountValue,
          taxable_amount: totals.taxableAmount,
          gst_type: input.gstType,
          tax_rate: input.taxRate,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          round_off: totals.roundOff,
          total: totals.total,
          doc_status: input.docStatus,
          terms: input.terms.trim(),
          notes: input.notes.trim(),
          created_by: input.userEmail || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Stock-out: replace any prior ledger rows for this invoice (edit case) atomically —
      // a single RPC call (delete + insert in one transaction) instead of two separate
      // requests, so a concurrent edit or a mid-operation failure can't double-count or
      // silently drop stock movement.
      const ledgerRows = input.items
        .filter((i) => i.productId && i.qty > 0)
        .map((i) => ({
          item_type: "product" as const,
          item_id: i.productId,
          movement: -i.qty,
          note: `Invoice ${input.invoiceNumber}`,
          created_by: input.userEmail || null,
        }));
      const { error: ledgerError } = await supabase.rpc("replace_inventory_ledger", {
        p_ref_type: "sale",
        p_ref_id: data.id,
        p_rows: ledgerRows,
      });
      if (ledgerError) throw ledgerError;

      await logAction(supabase, input.userEmail, isNew ? `Invoice created: ${input.invoiceNumber}` : `Invoice updated: ${input.invoiceNumber}`, null, `₹${totals.total}`);
      return data;
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

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, invoiceNumber, userEmail }: { id: string; invoiceNumber: string; userEmail?: string }) => {
      const supabase = createClient();
      // Reversing the ledger rows automatically corrects stock — it's always SUM(movement).
      await supabase.from("inventory_ledger").delete().eq("ref_type", "sale").eq("ref_id", id);
      const { error } = await supabase.from("sales_invoices").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Invoice deleted: ${invoiceNumber}`);
    },
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
  userEmail?: string;
}

export function useRecordSalesPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordSalesPaymentInput) => {
      const supabase = createClient();
      if (!input.amount || input.amount <= 0) throw new Error("Enter a valid payment amount");
      const { error } = await supabase.from("sales_payments").insert({
        invoice_id: input.invoiceId,
        customer_mobile: input.customerMobile,
        amount: input.amount,
        method: input.method,
        date: input.date,
        note: input.note.trim(),
        created_by: input.userEmail || null,
      });
      if (error) throw error;
      await logAction(supabase, input.userEmail, `Payment received: ₹${input.amount} for invoice ${input.invoiceNumber}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Deletes a single payment record — the invoice's paid/balance figures are always derived live from remaining `sales_payments` rows, so nothing else needs updating. */
export function useDeleteSalesPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount, invoiceNumber, userEmail }: { id: string; amount: number; invoiceNumber: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("sales_payments").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Payment deleted: ₹${amount} for invoice ${invoiceNumber}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Deletes several payment records in one go — for the "select all" bulk-delete on the Payments Received list. */
export function useBulkDeleteSalesPayments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, userEmail }: { ids: string[]; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("sales_payments").delete().in("id", ids);
      if (error) throw error;
      await logAction(supabase, userEmail, `${ids.length} payment(s) deleted`);
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

export function useRaiseSalesCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RaiseSalesCreditInput) => {
      const supabase = createClient();
      const total = computeLineItemsTotal(input.items);
      if (total <= 0) throw new Error("Add at least one returned item");

      const { data, error } = await supabase
        .from("sales_credit_notes")
        .insert({
          credit_number: input.creditNumber,
          invoice_id: input.invoiceId,
          customer_mobile: input.customerMobile,
          date: input.date,
          items: input.items as never,
          total,
          reason: input.reason.trim(),
          notes: input.notes.trim(),
          created_by: input.userEmail || null,
        })
        .select()
        .single();
      if (error) throw error;

      const ledgerRows = input.items
        .filter((i) => i.productId && i.qty > 0)
        .map((i) => ({
          item_type: "product" as const,
          item_id: i.productId,
          movement: i.qty,
          ref_type: "sale_return" as const,
          ref_id: data.id,
          note: `Return against invoice ${input.invoiceNumber}`,
          created_by: input.userEmail || null,
        }));
      if (ledgerRows.length) {
        const { error: ledgerError } = await supabase.from("inventory_ledger").insert(ledgerRows);
        if (ledgerError) throw ledgerError;
      }

      await logAction(supabase, input.userEmail, `Credit note raised: ${input.creditNumber} (₹${total}) against invoice ${input.invoiceNumber}`);
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}
