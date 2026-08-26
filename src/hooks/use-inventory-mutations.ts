"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ItemType } from "@/lib/inventory";

/** Fire-and-forget: tells the server to run the Phase 3 matching engine and push a notification
 *  if there are strong customer matches for this restock. Never awaited by callers and never
 *  throws — a failed/unconfigured push must not block or fail the actual stock write. */
function notifyStockMatch(productId: string, movement: number) {
  if (movement <= 0) return;
  fetch("/api/inventory/stock-match-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, movement }),
  }).catch(() => {});
}

function invalidateInventory(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["raw-materials"] });
  qc.invalidateQueries({ queryKey: ["products"] });
  qc.invalidateQueries({ queryKey: ["inventory-ledger"] });
}

interface RowWithId {
  id: string;
  name: string;
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

interface SaveRawMaterialInput {
  id?: string;
  name: string;
  unitId: string;
  costPerUnit: number;
  category: string;
  lowStockAlert: number;
  notes: string;
  /** Only applied on create — inserts an "opening" ledger entry alongside the row. */
  openingStock?: number;
  userEmail?: string;
}

export function useSaveRawMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveRawMaterialInput) => (await apiPost<{ rawMaterial: RowWithId }>("/api/inventory/raw-materials", input)).rawMaterial,
    onSuccess: () => invalidateInventory(qc),
  });
}

export function useDeleteRawMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string; userEmail?: string }) => apiDelete<{ ok: true }>(`/api/inventory/raw-materials/${id}`),
    onSuccess: () => invalidateInventory(qc),
  });
}

interface BomLineInput {
  rawMaterialId: string;
  qtyRequired: number;
}

interface SaveProductInput {
  id?: string;
  name: string;
  sku: string;
  category: string;
  sellingPrice: number;
  costPrice: number;
  taxRate: number;
  lowStockAlert: number;
  notes: string;
  bom: BomLineInput[];
  openingStock?: number;
  barcode?: string;
  size?: string;
  color?: string;
  fabric?: string;
  pattern?: string;
  occasion?: string;
  brand?: string;
  imageDataUrl?: string | null;
  userEmail?: string;
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveProductInput) => {
      const product = (await apiPost<{ product: RowWithId }>("/api/inventory/products", input)).product;
      if (!input.id && input.openingStock && input.openingStock > 0) notifyStockMatch(product.id, input.openingStock);
      return product;
    },
    onSuccess: () => invalidateInventory(qc),
  });
}

/** Targeted single-field patch (e.g. inline table editing) — unlike useSaveProduct, never touches BOM rows. */
export function useQuickUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sellingPrice, name }: { id: string; sellingPrice: number; userEmail?: string; name: string }) =>
      apiPatch<{ ok: true }>(`/api/inventory/products/${id}`, { sellingPrice, name }),
    onSuccess: () => invalidateInventory(qc),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string; userEmail?: string }) => apiDelete<{ ok: true }>(`/api/inventory/products/${id}`),
    onSuccess: () => invalidateInventory(qc),
  });
}

export function useBulkDeleteProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids }: { ids: string[]; userEmail?: string }) => apiPost<{ deleted: number; skipped: number }>("/api/inventory/products/bulk-delete", { ids }),
    onSuccess: () => invalidateInventory(qc),
  });
}

interface StockAdjustmentInput {
  itemType: ItemType;
  itemId: string;
  itemName: string;
  movement: number;
  note: string;
  userEmail?: string;
}

interface StockTransferInput {
  itemType: ItemType;
  itemId: string;
  itemName: string;
  fromWarehouseId: string | null;
  toWarehouseId: string;
  qty: number;
  note: string;
  userEmail?: string;
}

/** Moves stock between warehouses as a paired transfer_out/transfer_in ledger entry. */
export function useTransferStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StockTransferInput) => apiPost<{ ok: true }>("/api/inventory/stock-transfer", input),
    onSuccess: () => invalidateInventory(qc),
  });
}

/** Manual correction — the only ledger write path exposed directly to users in Phase 1. */
export function useRecordStockAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StockAdjustmentInput) => {
      await apiPost<{ ok: true }>("/api/inventory/stock-adjustment", input);
      if (input.itemType === "product") notifyStockMatch(input.itemId, input.movement);
    },
    onSuccess: () => invalidateInventory(qc),
  });
}
