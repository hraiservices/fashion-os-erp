"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import { computeLineItemsTotal, purchaseItemType, purchaseItemId, type PurchaseLineItem, type PoStatus } from "@/lib/purchases";
import { computeGst, type GstType } from "@/lib/gst";

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["vendors"] });
  qc.invalidateQueries({ queryKey: ["vendor"] });
  qc.invalidateQueries({ queryKey: ["purchase-orders"] });
  qc.invalidateQueries({ queryKey: ["purchase-order"] });
  qc.invalidateQueries({ queryKey: ["purchase-bills"] });
  qc.invalidateQueries({ queryKey: ["purchase-bill"] });
  qc.invalidateQueries({ queryKey: ["vendor-payments"] });
  qc.invalidateQueries({ queryKey: ["vendor-credits"] });
  qc.invalidateQueries({ queryKey: ["raw-materials"] });
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

// ── Vendors ───────────────────────────────────────────────────────────────

interface SaveVendorInput {
  id?: string;
  name: string;
  mobile: string;
  email: string;
  gstin: string;
  state: string;
  address: string;
  notes: string;
  userEmail?: string;
}

export function useSaveVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveVendorInput) => {
      const supabase = createClient();
      const isNew = !input.id;
      const { data, error } = await supabase
        .from("vendors")
        .upsert({
          id: input.id,
          name: input.name.trim(),
          mobile: input.mobile.trim(),
          email: input.email.trim(),
          gstin: input.gstin.trim(),
          state: input.state.trim(),
          address: input.address.trim(),
          notes: input.notes.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      await logAction(supabase, input.userEmail, isNew ? `Vendor added: ${input.name}` : `Vendor updated: ${input.name}`);
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, userEmail }: { id: string; name: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Vendor deleted: ${name}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Purchase Orders (planning documents — no stock impact) ─────────────────

interface SavePurchaseOrderInput {
  id?: string;
  poNumber: string;
  vendorId: string;
  date: string;
  status: PoStatus;
  items: PurchaseLineItem[];
  notes: string;
  userEmail?: string;
}

export function useSavePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePurchaseOrderInput) => {
      const supabase = createClient();
      const isNew = !input.id;
      const total = computeLineItemsTotal(input.items);
      const { data, error } = await supabase
        .from("purchase_orders")
        .upsert({
          id: input.id,
          po_number: input.poNumber,
          vendor_id: input.vendorId,
          date: input.date,
          status: input.status,
          items: input.items as never,
          total,
          notes: input.notes.trim(),
          created_by: input.userEmail || null,
        })
        .select()
        .single();
      if (error) throw error;
      await logAction(supabase, input.userEmail, isNew ? `Purchase order created: ${input.poNumber}` : `Purchase order updated: ${input.poNumber}`);
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, poNumber, userEmail }: { id: string; poNumber: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("purchase_orders").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Purchase order cancelled: ${poNumber}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Purchase Bills (receiving stock happens here) ──────────────────────────

interface SaveBillInput {
  id?: string;
  billNumber: string;
  vendorId: string;
  poId?: string | null;
  billDate: string;
  dueDate?: string | null;
  items: PurchaseLineItem[];
  gstType: GstType;
  taxRate: number;
  notes: string;
  userEmail?: string;
}

export function useSaveBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveBillInput) => {
      const supabase = createClient();
      const isNew = !input.id;
      const taxableAmount = computeLineItemsTotal(input.items);
      const gst = computeGst(taxableAmount, input.taxRate, input.gstType);

      const { data, error } = await supabase
        .from("purchase_bills")
        .upsert({
          id: input.id,
          bill_number: input.billNumber,
          vendor_id: input.vendorId,
          po_id: input.poId || null,
          bill_date: input.billDate,
          due_date: input.dueDate || null,
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

      const ledgerRows = input.items
        .filter((i) => purchaseItemId(i) && i.qty > 0)
        .map((i) => ({
          item_type: purchaseItemType(i),
          item_id: purchaseItemId(i),
          movement: i.qty,
          note: `Bill ${input.billNumber}`,
          created_by: input.userEmail || null,
        }));
      const { error: ledgerError } = await supabase.rpc("replace_inventory_ledger", {
        p_ref_type: "purchase",
        p_ref_id: data.id,
        p_rows: ledgerRows,
      });
      if (ledgerError) throw ledgerError;

      await logAction(supabase, input.userEmail, isNew ? `Bill received: ${input.billNumber}` : `Bill updated: ${input.billNumber}`, null, `₹${gst.total}`);
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/**
 * Delete a purchase bill via the server route.
 *
 * H-3: The API route blocks delete if vendor payments or credits exist.
 * C-1: Permission enforced server-side.
 */
export function useDeleteBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; billNumber: string; userEmail?: string }) =>
      apiDelete<{ ok: true }>(`/api/purchases/bills/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Vendor Payments ──────────────────────────────────────────────────────

interface RecordPaymentInput {
  billId: string;
  vendorId: string;
  billNumber: string;
  amount: number;
  method: string;
  date: string;
  note: string;
  userEmail?: string;
}

/**
 * Record a vendor payment via the server route.
 *
 * H-1: The API route checks the outstanding balance and rejects overpayments.
 * C-1: Permission enforced server-side.
 * H-8: created_by from server session.
 */
export function useRecordVendorPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userEmail: _ignored, ...input }: RecordPaymentInput) =>
      apiPost<{ ok: true }>("/api/purchases/payments", input),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Deletes a single vendor payment. Permission enforced server-side. */
export function useDeleteVendorPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; amount: number; billNumber: string; userEmail?: string }) =>
      apiDelete<{ ok: true }>(`/api/purchases/payments/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Bulk-delete vendor payment records. */
export function useBulkDeleteVendorPayments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids }: { ids: string[]; userEmail?: string }) => {
      await Promise.all(ids.map((id) => apiDelete(`/api/purchases/payments/${id}`)));
    },
    onSuccess: () => invalidateAll(qc),
  });
}

// ── Vendor Credits (returns — reduces stock and the amount owed) ───────────

interface RaiseCreditInput {
  vendorId: string;
  billId: string;
  billNumber: string;
  creditNumber: string;
  date: string;
  items: PurchaseLineItem[];
  reason: string;
  notes: string;
  userEmail?: string;
}

export function useRaiseVendorCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RaiseCreditInput) => {
      const supabase = createClient();
      const total = computeLineItemsTotal(input.items);
      if (total <= 0) throw new Error("Add at least one returned item");

      const { data, error } = await supabase
        .from("vendor_credits")
        .insert({
          credit_number: input.creditNumber,
          vendor_id: input.vendorId,
          bill_id: input.billId,
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
        .filter((i) => purchaseItemId(i) && i.qty > 0)
        .map((i) => ({
          item_type: purchaseItemType(i),
          item_id: purchaseItemId(i),
          movement: -i.qty,
          ref_type: "purchase_return" as const,
          ref_id: data.id,
          note: `Return against bill ${input.billNumber}`,
          created_by: input.userEmail || null,
        }));
      if (ledgerRows.length) {
        const { error: ledgerError } = await supabase.from("inventory_ledger").insert(ledgerRows);
        if (ledgerError) throw ledgerError;
      }

      await logAction(supabase, input.userEmail, `Vendor credit raised: ${input.creditNumber} (₹${total}) against bill ${input.billNumber}`);
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}
