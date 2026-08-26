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

/** Previously ran entirely client-side with no permission check — see the API route's comment. */
export function useSaveQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveQuotationInput) => (await apiPost<{ quotation: { id: string } }>("/api/sales/quotations", input)).quotation,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetQuotationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; quoteNumber: string; status: QuoteStatus; userEmail?: string }) =>
      apiPost<{ ok: true }>(`/api/sales/quotations/${id}/status`, { status }),
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
  /** Backdated/historical invoices only — skip decrementing current stock. See the route. */
  skipInventoryEffect?: boolean;
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
      const res = await apiPost<{ ok: true; data: { id: string; invoice_number: string } }>("/api/sales/invoices", input);
      return res.data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Toggles the lightweight Draft/Sent label — purely a "have I sent this yet" marker, no stock impact. */
/** Previously ran entirely client-side with no permission check — see the API route's comment. */
export function useSetInvoiceDocStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, docStatus }: { id: string; invoiceNumber: string; docStatus: InvoiceDocStatus; userEmail?: string }) =>
      apiPost<{ ok: true }>(`/api/sales/invoices/${id}/doc-status`, { docStatus }),
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
