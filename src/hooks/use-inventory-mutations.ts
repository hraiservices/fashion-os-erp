"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import { genBarcode, type ItemType } from "@/lib/inventory";

function invalidateInventory(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["raw-materials"] });
  qc.invalidateQueries({ queryKey: ["products"] });
  qc.invalidateQueries({ queryKey: ["inventory-ledger"] });
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
    mutationFn: async (input: SaveRawMaterialInput) => {
      const supabase = createClient();
      const isNew = !input.id;

      const { data, error } = await supabase
        .from("raw_materials")
        .upsert({
          id: input.id,
          name: input.name.trim(),
          unit_id: input.unitId,
          cost_per_unit: input.costPerUnit,
          category: input.category.trim(),
          low_stock_alert: input.lowStockAlert,
          notes: input.notes.trim(),
        })
        .select()
        .single();
      if (error) throw error;

      if (isNew && input.openingStock && input.openingStock > 0) {
        const { error: ledgerError } = await supabase.from("inventory_ledger").insert({
          item_type: "raw_material" as ItemType,
          item_id: data.id,
          movement: input.openingStock,
          ref_type: "opening",
          note: "Opening stock",
          created_by: input.userEmail || null,
        });
        if (ledgerError) throw ledgerError;
      }

      await logAction(supabase, input.userEmail, isNew ? `Raw material added: ${input.name}` : `Raw material updated: ${input.name}`);
      return data;
    },
    onSuccess: () => invalidateInventory(qc),
  });
}

export function useDeleteRawMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, userEmail }: { id: string; name: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("raw_materials").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Raw material deleted: ${name}`);
    },
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
      const supabase = createClient();
      const isNew = !input.id;

      const { data, error } = await supabase
        .from("products")
        .upsert({
          id: input.id,
          name: input.name.trim(),
          sku: input.sku.trim(),
          category: input.category.trim(),
          selling_price: input.sellingPrice,
          cost_price: input.costPrice,
          tax_rate: input.taxRate,
          low_stock_alert: input.lowStockAlert,
          notes: input.notes.trim(),
          barcode: input.barcode?.trim() || genBarcode(),
          size: input.size || null,
          color: input.color || null,
          fabric: input.fabric || null,
          pattern: input.pattern || null,
          occasion: input.occasion || null,
          brand: input.brand?.trim() || null,
          image_data_url: input.imageDataUrl ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      // Replace BOM lines wholesale — same pattern as cost_sheet_items.
      await supabase.from("bill_of_materials").delete().eq("product_id", data.id);
      const bomRows = input.bom.filter((b) => b.rawMaterialId && b.qtyRequired > 0).map((b) => ({ product_id: data.id, raw_material_id: b.rawMaterialId, qty_required: b.qtyRequired }));
      if (bomRows.length) {
        const { error: bomError } = await supabase.from("bill_of_materials").insert(bomRows);
        if (bomError) throw bomError;
      }

      if (isNew && input.openingStock && input.openingStock > 0) {
        const { error: ledgerError } = await supabase.from("inventory_ledger").insert({
          item_type: "product" as ItemType,
          item_id: data.id,
          movement: input.openingStock,
          ref_type: "opening",
          note: "Opening stock",
          created_by: input.userEmail || null,
        });
        if (ledgerError) throw ledgerError;
      }

      await logAction(supabase, input.userEmail, isNew ? `Product added: ${input.name}` : `Product updated: ${input.name}`);
      return data;
    },
    onSuccess: () => invalidateInventory(qc),
  });
}

/** Targeted single-field patch (e.g. inline table editing) — unlike useSaveProduct, never touches BOM rows. */
export function useQuickUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sellingPrice, userEmail, name }: { id: string; sellingPrice: number; userEmail?: string; name: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("products").update({ selling_price: sellingPrice }).eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Product price updated: ${name} → ${sellingPrice}`);
    },
    onSuccess: () => invalidateInventory(qc),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, userEmail }: { id: string; name: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Product deleted: ${name}`);
    },
    onSuccess: () => invalidateInventory(qc),
  });
}

export function useBulkDeleteProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, userEmail }: { ids: string[]; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("products").delete().in("id", ids);
      if (error) throw error;
      await logAction(supabase, userEmail, `${ids.length} product(s) deleted`);
    },
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
    mutationFn: async (input: StockTransferInput) => {
      const supabase = createClient();
      if (!input.qty || input.qty <= 0) throw new Error("Enter a quantity greater than zero");
      if (input.fromWarehouseId === input.toWarehouseId) throw new Error("Source and destination warehouses must differ");
      const { error } = await supabase.from("inventory_ledger").insert([
        {
          item_type: input.itemType,
          item_id: input.itemId,
          movement: -input.qty,
          ref_type: "transfer_out",
          note: input.note.trim(),
          warehouse_id: input.fromWarehouseId,
          created_by: input.userEmail || null,
        },
        {
          item_type: input.itemType,
          item_id: input.itemId,
          movement: input.qty,
          ref_type: "transfer_in",
          note: input.note.trim(),
          warehouse_id: input.toWarehouseId,
          created_by: input.userEmail || null,
        },
      ]);
      if (error) throw error;
      await logAction(supabase, input.userEmail, `Stock transfer: ${input.itemName} (${input.qty})`, null, input.note);
    },
    onSuccess: () => invalidateInventory(qc),
  });
}

/** Manual correction — the only ledger write path exposed directly to users in Phase 1. */
export function useRecordStockAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StockAdjustmentInput) => {
      const supabase = createClient();
      if (!input.movement) throw new Error("Enter a non-zero quantity");
      const { error } = await supabase.from("inventory_ledger").insert({
        item_type: input.itemType,
        item_id: input.itemId,
        movement: input.movement,
        ref_type: "adjustment",
        note: input.note.trim(),
        created_by: input.userEmail || null,
      });
      if (error) throw error;
      await logAction(supabase, input.userEmail, `Stock adjustment: ${input.itemName} (${input.movement > 0 ? "+" : ""}${input.movement})`, null, input.note);
    },
    onSuccess: () => invalidateInventory(qc),
  });
}
