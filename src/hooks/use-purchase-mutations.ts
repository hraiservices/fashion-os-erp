"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PurchaseLineItem, PoStatus } from "@/lib/purchases";
import type { GstType } from "@/lib/gst";

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

interface RowWithId {
  id: string;
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
    mutationFn: async (input: SaveVendorInput) => (await apiPost<{ vendor: RowWithId }>("/api/purchases/vendors", input)).vendor,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string; userEmail?: string }) => apiDelete<{ ok: true }>(`/api/purchases/vendors/${id}`),
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
    mutationFn: async (input: SavePurchaseOrderInput) => (await apiPost<{ purchaseOrder: RowWithId }>("/api/purchases/orders", input)).purchaseOrder,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; poNumber: string; userEmail?: string }) => apiPost<{ ok: true }>(`/api/purchases/orders/${id}/cancel`, {}),
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
    mutationFn: async (input: SaveBillInput) => (await apiPost<{ bill: RowWithId }>("/api/purchases/bills", input)).bill,
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
    mutationFn: (input: RaiseCreditInput) => apiPost<{ credit: unknown }>("/api/purchases/credits", input),
    onSuccess: () => invalidateAll(qc),
  });
}
