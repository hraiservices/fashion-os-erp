"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import { computeWoCost, type WorkOrderMaterial, type WoStatus } from "@/lib/manufacturing";

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["work-orders"] });
  qc.invalidateQueries({ queryKey: ["work-order"] });
  qc.invalidateQueries({ queryKey: ["raw-materials"] });
  qc.invalidateQueries({ queryKey: ["products"] });
  qc.invalidateQueries({ queryKey: ["inventory-ledger"] });
}

interface CreateWorkOrderInput {
  woNumber: string;
  productId: string;
  productName: string;
  qtyToProduce: number;
  tailor: string;
  startDate: string;
  dueDate?: string | null;
  materials: WorkOrderMaterial[];
  laborCostPerPiece: number;
  notes: string;
  userEmail?: string;
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWorkOrderInput) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("work_orders")
        .insert({
          wo_number: input.woNumber,
          product_id: input.productId,
          product_name: input.productName,
          qty_to_produce: input.qtyToProduce,
          tailor: input.tailor,
          start_date: input.startDate,
          due_date: input.dueDate || null,
          status: "draft",
          materials: input.materials as never,
          labor_cost_per_piece: input.laborCostPerPiece,
          notes: input.notes.trim(),
          created_by: input.userEmail || null,
        })
        .select()
        .single();
      if (error) throw error;
      await logAction(supabase, input.userEmail, `Work order created: ${input.woNumber} (${input.qtyToProduce}x ${input.productName})`);
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

interface UpdateWorkOrderInput {
  id: string;
  woNumber: string;
  productId: string;
  productName: string;
  qtyToProduce: number;
  tailor: string;
  startDate: string;
  dueDate?: string | null;
  materials: WorkOrderMaterial[];
  laborCostPerPiece: number;
  notes: string;
  userEmail?: string;
}

/** Editing is only offered in the UI while status !== "completed" — status itself is untouched here. */
export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateWorkOrderInput) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("work_orders")
        .update({
          product_id: input.productId,
          product_name: input.productName,
          qty_to_produce: input.qtyToProduce,
          tailor: input.tailor,
          start_date: input.startDate,
          due_date: input.dueDate || null,
          materials: input.materials as never,
          labor_cost_per_piece: input.laborCostPerPiece,
          notes: input.notes.trim(),
        })
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      await logAction(supabase, input.userEmail, `Work order updated: ${input.woNumber}`);
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAdvanceWoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, woNumber, status, userEmail }: { id: string; woNumber: string; status: WoStatus; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("work_orders").update({ status }).eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Work order ${woNumber} moved to ${status}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

interface CompleteWorkOrderInput {
  id: string;
  woNumber: string;
  productId: string;
  qtyToProduce: number;
  laborCostPerPiece: number;
  materials: WorkOrderMaterial[];
  userEmail?: string;
}

/**
 * Completing a work order is the moment stock actually moves: raw materials are consumed
 * (qty_used + qty_wasted both leave stock) and the finished product is produced. Cost fields
 * are computed once here and frozen on the row — they must not silently recompute later.
 */
export function useCompleteWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompleteWorkOrderInput) => {
      const supabase = createClient();
      const cost = computeWoCost(input.materials, input.laborCostPerPiece, input.qtyToProduce);

      const { error } = await supabase
        .from("work_orders")
        .update({
          status: "completed",
          materials: input.materials as never,
          material_cost: cost.materialCost,
          wastage_cost: cost.wastageCost,
          labor_cost: cost.laborCost,
          total_cost: cost.totalCost,
          cost_per_unit: cost.costPerUnit,
          completed_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;

      const consumeRows = input.materials
        .filter((m) => (m.qtyUsed || 0) + (m.qtyWasted || 0) > 0)
        .map((m) => ({
          item_type: "raw_material" as const,
          item_id: m.rawMaterialId,
          movement: -((m.qtyUsed || 0) + (m.qtyWasted || 0)),
          ref_type: "work_order_consume" as const,
          ref_id: input.id,
          note: `Consumed for ${input.woNumber}`,
          created_by: input.userEmail || null,
        }));
      if (consumeRows.length) {
        const { error: consumeError } = await supabase.from("inventory_ledger").insert(consumeRows);
        if (consumeError) throw consumeError;
      }

      const { error: produceError } = await supabase.from("inventory_ledger").insert({
        item_type: "product",
        item_id: input.productId,
        movement: input.qtyToProduce,
        ref_type: "work_order_produce",
        ref_id: input.id,
        note: `Produced by ${input.woNumber}`,
        created_by: input.userEmail || null,
      });
      if (produceError) throw produceError;

      await logAction(supabase, input.userEmail, `Work order completed: ${input.woNumber}`, null, `Cost/unit ₹${cost.costPerUnit}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, woNumber, userEmail }: { id: string; woNumber: string; userEmail?: string }) => {
      const supabase = createClient();
      // Reversing ledger rows automatically corrects stock — always SUM(movement). A no-op
      // if the work order never reached "completed" (no rows were ever written for it).
      await supabase.from("inventory_ledger").delete().eq("ref_id", id).in("ref_type", ["work_order_consume", "work_order_produce"]);
      const { error } = await supabase.from("work_orders").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Work order deleted: ${woNumber}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}
