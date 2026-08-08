"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { LineItem, TailorLineItem } from "@/lib/cost-sheet";

export interface CostSheetWithItems {
  id: string;
  cost_sheet_no: string;
  date: string;
  customer_name: string;
  customer_mobile: string;
  product_name: string;
  category: string;
  notes: string;
  status: string;
  profit_mode: string;
  profit_amount: number;
  profit_percent: number;
  materials: LineItem[];
  tailors: TailorLineItem[];
  overheads: LineItem[];
}

async function fetchCostSheet(id: string): Promise<CostSheetWithItems | null> {
  const supabase = createClient();
  const { data: sheet, error } = await supabase.from("product_cost_sheets").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!sheet) return null;

  const { data: items } = await supabase.from("cost_sheet_items").select("*").eq("cost_sheet_id", id);
  const materials = (items || []).filter((i) => i.item_type === "material").map((i) => ({ id: i.id, expense_name: i.expense_name, quantity: i.quantity, unit: i.unit, rate: i.rate, amount: i.amount }));
  const tailors = (items || []).filter((i) => i.item_type === "tailor").map((i) => ({ id: i.id, tailor_name: i.expense_name, tailor_charge: i.rate }));
  const overheads = (items || []).filter((i) => i.item_type === "overhead").map((i) => ({ id: i.id, expense_name: i.expense_name, quantity: i.quantity, unit: i.unit, rate: i.rate, amount: i.amount }));

  return { ...sheet, materials, tailors, overheads };
}

export function useCostSheet(id: string) {
  return useQuery({
    queryKey: ["cost-sheet", id],
    queryFn: () => fetchCostSheet(id),
    enabled: !!id,
  });
}
