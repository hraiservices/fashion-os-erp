import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { computeTotals, type LineItem, type TailorLineItem, type ProfitConfig } from "@/lib/cost-sheet";

const lineItemSchema = z.object({ id: z.string(), expense_name: z.string().optional(), quantity: z.union([z.string(), z.number()]).optional(), unit: z.string().optional(), rate: z.union([z.string(), z.number()]).optional(), amount: z.union([z.string(), z.number()]).optional() });
const tailorLineItemSchema = z.object({ id: z.string(), tailor_name: z.string().optional(), tailor_charge: z.union([z.string(), z.number()]).optional() });
const profitSchema = z.object({ mode: z.enum(["percent", "amount"]), percent: z.union([z.string(), z.number()]).optional(), amount: z.union([z.string(), z.number()]).optional() });

const bodySchema = z.object({
  id: z.string().optional(),
  cost_sheet_no: z.string().min(1),
  date: z.string().min(1),
  customer_name: z.string().default(""),
  customer_mobile: z.string().default(""),
  product_name: z.string().default(""),
  category: z.string().default(""),
  notes: z.string().default(""),
  status: z.enum(["draft", "final"]),
  materials: z.array(lineItemSchema),
  tailors: z.array(tailorLineItemSchema),
  overheads: z.array(lineItemSchema),
  profit: profitSchema,
});

/** Create/update a product cost sheet. Previously ran entirely client-side with no permission
 *  check at all. */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to manage cost sheets" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const id = fd.id || `cs_${Date.now()}`;
  const totals = computeTotals(fd.materials as LineItem[], fd.tailors as TailorLineItem[], fd.overheads as LineItem[], fd.profit as ProfitConfig);

  const { error } = await db.from("product_cost_sheets").upsert({
    id,
    cost_sheet_no: fd.cost_sheet_no,
    date: fd.date,
    customer_name: fd.customer_name,
    customer_mobile: fd.customer_mobile,
    product_name: fd.product_name,
    category: fd.category,
    notes: fd.notes,
    status: fd.status,
    total_material_cost: totals.matTotal,
    total_tailor_cost: totals.tlTotal,
    total_overhead_cost: totals.ovTotal,
    total_expense: totals.totalExpense,
    profit_mode: fd.profit.mode,
    profit_amount: totals.profitAmount,
    profit_percent: fd.profit.mode === "percent" ? parseFloat(String(fd.profit.percent)) || 0 : totals.profitPercentDisplay,
    final_price: totals.finalPrice,
    created_by: user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("cost_sheet_items").delete().eq("cost_sheet_id", id);

  const rows = [
    ...fd.materials
      .filter((m) => m.expense_name || m.amount)
      .map((m) => ({ id: `csi_m_${m.id}`, cost_sheet_id: id, expense_name: m.expense_name || "", quantity: parseFloat(String(m.quantity)) || 1, unit: m.unit || "", rate: parseFloat(String(m.rate)) || 0, amount: parseFloat(String(m.amount)) || 0, item_type: "material" })),
    ...fd.tailors
      .filter((t) => t.tailor_name || t.tailor_charge)
      .map((t) => ({ id: `csi_t_${t.id}`, cost_sheet_id: id, expense_name: t.tailor_name || "", quantity: 1, unit: "Job", rate: parseFloat(String(t.tailor_charge)) || 0, amount: parseFloat(String(t.tailor_charge)) || 0, item_type: "tailor" })),
    ...fd.overheads
      .filter((o) => o.expense_name || o.amount)
      .map((o) => ({ id: `csi_o_${o.id}`, cost_sheet_id: id, expense_name: o.expense_name || "", quantity: parseFloat(String(o.quantity)) || 1, unit: o.unit || "", rate: parseFloat(String(o.rate)) || 0, amount: parseFloat(String(o.amount)) || 0, item_type: "overhead" })),
  ];
  if (rows.length) {
    const { error: itemsError } = await db.from("cost_sheet_items").insert(rows);
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  await logAction(supabase, user.email, fd.id ? "cost_sheet_updated" : "cost_sheet_created", id, `${fd.product_name} | Final: ₹${totals.finalPrice}`);
  return NextResponse.json({ id, totals });
}
