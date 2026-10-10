import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_RATES } from "@/lib/business-rules";
import { istDateString } from "@/lib/ist-date";
import { loadStaff, targetsContext } from "@/lib/targets-server";
import type { StageLabelOverrides } from "@/lib/lead-stages";

/**
 * Everything the Targets screens need to fill their pickers: staff, products, garment types,
 * renamed stage labels, today's shop-local date, and what this user is allowed to do. One small
 * request instead of five. Staff come through the service client because the employees table is
 * locked against the caller's own session — only id/name/role/active are returned, never salary.
 */
export async function GET() {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const [staff, productsRes, ratesRes, labelsRes] = await Promise.all([
    loadStaff(db),
    db.from("products").select("id, name, sku").order("name").limit(1000),
    db.from("app_settings").select("value").eq("key", "rates").maybeSingle(),
    db.from("app_settings").select("value").eq("key", "leadStageLabels").maybeSingle(),
  ]);

  const rates = (ratesRes.data?.value as Record<string, unknown> | null) || DEFAULT_RATES;
  return NextResponse.json({
    today: istDateString(),
    me: { email: ctx.email, employeeId: ctx.employeeId, role: ctx.role },
    can: {
      manageLeads: ctx.perms.manageLeads,
      manageTargets: ctx.perms.manageTargets,
      viewAll: ctx.seesAll,
      assignTasks: ctx.perms.assignTasks,
      viewReports: ctx.perms.viewReports,
      /** The invoice screens only exist when Product Sales is licensed and permitted. */
      createInvoice: ctx.perms.manageSales,
      createOrder: ctx.perms.addOrder,
    },
    staff,
    products: (productsRes.data || []).map((p) => ({ id: p.id, name: p.name, sku: p.sku })),
    garmentTypes: Object.keys(rates),
    stageLabels: (labelsRes.data?.value as StageLabelOverrides | null) || {},
  });
}
