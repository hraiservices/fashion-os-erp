import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_RATES } from "@/lib/business-rules";
import { isModuleEnabled } from "@/lib/entitlements";
import { istDateString } from "@/lib/ist-date";
import { LEAD_STAGES, type StageLabelOverrides } from "@/lib/lead-stages";
import { loadStaff, targetsContext } from "@/lib/targets-server";

/**
 * Everything the Targets screens need to fill their pickers: staff, products, garment types,
 * renamed stage labels, today's shop-local date, and what this user is allowed to do. One small
 * request instead of five. Staff come through the service client because the employees table is
 * locked against the caller's own session — only id/name/role/active are returned, never salary.
 *
 * `?lite=1` returns just the staff, today's date and the permissions — what the invoice form needs
 * for its "Sales person" picker — and skips the product and rate-card reads.
 */
export async function GET(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  const lite = new URL(request.url).searchParams.get("lite") === "1";

  const [staff, productsRes, ratesRes, labelsRes] = await Promise.all([
    loadStaff(db),
    lite ? null : db.from("products").select("id, name, sku").order("name").limit(1000),
    lite ? null : db.from("app_settings").select("value").eq("key", "rates").maybeSingle(),
    lite ? null : db.from("app_settings").select("value").eq("key", "leadStageLabels").maybeSingle(),
  ]);

  const rates = (ratesRes?.data?.value as Record<string, unknown> | null) || DEFAULT_RATES;

  // The stage names are a plain shop setting anyone signed in can write to, so only short text for the six known
  // stages is passed on — anything else (a number, a list) would otherwise break every screen that shows a stage.
  const stageLabels: StageLabelOverrides = {};
  const rawLabels = labelsRes?.data?.value;
  if (rawLabels && typeof rawLabels === "object" && !Array.isArray(rawLabels)) {
    for (const stage of LEAD_STAGES) {
      const v = (rawLabels as Record<string, unknown>)[stage];
      if (typeof v === "string" && v.trim()) stageLabels[stage] = v.trim().slice(0, 24);
    }
  }

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
      createInvoice: ctx.perms.manageSales && isModuleEnabled(ctx.modules, "sales"),
      createOrder: ctx.perms.addOrder,
    },
    staff,
    products: (productsRes?.data || []).map((p) => ({ id: p.id, name: p.name, sku: p.sku })),
    garmentTypes: Object.keys(rates),
    stageLabels,
  });
}
