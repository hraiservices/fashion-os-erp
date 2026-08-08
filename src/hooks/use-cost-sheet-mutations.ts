"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import { computeTotals, type LineItem, type TailorLineItem, type ProfitConfig } from "@/lib/cost-sheet";

interface SaveCostSheetInput {
  id?: string;
  cost_sheet_no: string;
  date: string;
  customer_name: string;
  customer_mobile: string;
  product_name: string;
  category: string;
  notes: string;
  status: "draft" | "final";
  materials: LineItem[];
  tailors: TailorLineItem[];
  overheads: LineItem[];
  profit: ProfitConfig;
  userEmail?: string;
}

/** saveForm(), Stitching_Manager_Pro_v16.html ~line 11578. */
export function useSaveCostSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveCostSheetInput) => {
      const supabase = createClient();
      const id = input.id || `cs_${Date.now()}`;
      const totals = computeTotals(input.materials, input.tailors, input.overheads, input.profit);

      const { error } = await supabase.from("product_cost_sheets").upsert({
        id,
        cost_sheet_no: input.cost_sheet_no,
        date: input.date,
        customer_name: input.customer_name,
        customer_mobile: input.customer_mobile,
        product_name: input.product_name,
        category: input.category,
        notes: input.notes,
        status: input.status,
        total_material_cost: totals.matTotal,
        total_tailor_cost: totals.tlTotal,
        total_overhead_cost: totals.ovTotal,
        total_expense: totals.totalExpense,
        profit_mode: input.profit.mode,
        profit_amount: totals.profitAmount,
        profit_percent: input.profit.mode === "percent" ? parseFloat(String(input.profit.percent)) || 0 : totals.profitPercentDisplay,
        final_price: totals.finalPrice,
        created_by: input.userEmail || "",
      });
      if (error) throw error;

      await supabase.from("cost_sheet_items").delete().eq("cost_sheet_id", id);

      const rows = [
        ...input.materials
          .filter((m) => m.expense_name || m.amount)
          .map((m) => ({ id: `csi_m_${m.id}`, cost_sheet_id: id, expense_name: m.expense_name || "", quantity: parseFloat(String(m.quantity)) || 1, unit: m.unit || "", rate: parseFloat(String(m.rate)) || 0, amount: parseFloat(String(m.amount)) || 0, item_type: "material" })),
        ...input.tailors
          .filter((t) => t.tailor_name || t.tailor_charge)
          .map((t) => ({ id: `csi_t_${t.id}`, cost_sheet_id: id, expense_name: t.tailor_name || "", quantity: 1, unit: "Job", rate: parseFloat(String(t.tailor_charge)) || 0, amount: parseFloat(String(t.tailor_charge)) || 0, item_type: "tailor" })),
        ...input.overheads
          .filter((o) => o.expense_name || o.amount)
          .map((o) => ({ id: `csi_o_${o.id}`, cost_sheet_id: id, expense_name: o.expense_name || "", quantity: parseFloat(String(o.quantity)) || 1, unit: o.unit || "", rate: parseFloat(String(o.rate)) || 0, amount: parseFloat(String(o.amount)) || 0, item_type: "overhead" })),
      ];
      if (rows.length) {
        const { error: itemsError } = await supabase.from("cost_sheet_items").insert(rows);
        if (itemsError) throw itemsError;
      }

      await logAction(supabase, input.userEmail, input.id ? "cost_sheet_updated" : "cost_sheet_created", id, `${input.product_name} | Final: ₹${totals.finalPrice}`);
      return { id, totals };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["cost-sheets"] });
      qc.invalidateQueries({ queryKey: ["cost-sheet", result.id] });
    },
  });
}

export function useDeleteCostSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userEmail }: { id: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("product_cost_sheets").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, "cost_sheet_deleted", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cost-sheets"] });
    },
  });
}
