import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { OPEN_STAGES } from "@/lib/lead-stages";
import { LEAD_IMPORT_MAX_ROWS } from "@/lib/lead-import";
import { parseBody, serverError } from "@/lib/targets-api";
import { leadVisible, loadStaff, targetsContext } from "@/lib/targets-server";
import { logAction } from "@/lib/logging";

const rowSchema = z.object({
  name: z.string().trim().max(120),
  mobile: z.string().trim().max(30),
  productInterest: z.string().trim().max(200),
  expectedValue: z.number().min(0).max(100_000_000),
  source: z.string().trim().max(60),
  owner: z.string().trim().max(120),
  stage: z.string().trim().max(20),
  likelyToClose: z.boolean().nullable(),
  notes: z.string().trim().max(1000),
});
const bodySchema = z.object({ rows: z.array(rowSchema).min(1, "The file has no rows").max(LEAD_IMPORT_MAX_ROWS, `Import up to ${LEAD_IMPORT_MAX_ROWS} leads at a time`) });

/**
 * POST — import leads parsed from an Excel/CSV file (manageLeads). A row whose mobile matches an open
 * lead UPDATES that lead (only the columns that were filled in); every other row adds a new lead.
 * Staff without the assign permission always own what they import. Rows that can't be used are
 * reported with their sheet row number instead of failing the whole file.
 */
export async function POST(request: Request) {
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, bodySchema);
  if ("error" in body) return body.error;

  try {
    const staff = (await loadStaff(db)).filter((s) => s.active);
    const byName = new Map<string, string[]>();
    for (const s of staff) {
      const k = s.name.trim().toLowerCase();
      byName.set(k, [...(byName.get(k) || []), s.id]);
    }
    const canAssignOthers = ctx.seesAll || ctx.perms.assignTasks;

    const { data: openLeads } = await db.from("leads").select("*").in("stage", [...OPEN_STAGES]).neq("mobile", "");
    const openByMobile = new Map((openLeads || []).map((l) => [l.mobile, l]));

    let added = 0;
    let updated = 0;
    const problems: { row: number; message: string }[] = [];

    for (let i = 0; i < body.data.rows.length; i++) {
      const r = body.data.rows[i];
      const rowNo = i + 2; // sheet row: header is row 1
      if (!r.name) {
        problems.push({ row: rowNo, message: "No name — skipped" });
        continue;
      }
      const mobile = r.mobile ? normalizeIndianMobile(r.mobile) : "";
      if (r.mobile && mobile.length < 10) {
        problems.push({ row: rowNo, message: `${r.name}: mobile number doesn't look right — skipped` });
        continue;
      }

      let owner: string | null | undefined; // undefined = column blank, keep as is
      if (r.owner) {
        const ids = byName.get(r.owner.toLowerCase());
        if (!ids) {
          problems.push({ row: rowNo, message: `${r.name}: no staff member called "${r.owner}" — skipped` });
          continue;
        }
        if (ids.length > 1) {
          problems.push({ row: rowNo, message: `${r.name}: more than one staff member is called "${r.owner}" — skipped` });
          continue;
        }
        owner = ids[0];
        if (owner !== ctx.employeeId && !canAssignOthers) owner = ctx.employeeId;
      }

      const existing = mobile ? openByMobile.get(mobile) : undefined;
      if (existing) {
        if (!leadVisible(existing, ctx)) {
          problems.push({ row: rowNo, message: `${r.name}: this number belongs to someone else's lead — skipped` });
          continue;
        }
        const patch: Database["public"]["Tables"]["leads"]["Update"] = { name: r.name, updated_at: new Date().toISOString() };
        if (r.productInterest) patch.product_interest = r.productInterest;
        if (r.expectedValue > 0) patch.expected_value = r.expectedValue;
        if (r.source) patch.source = r.source;
        if (r.notes) patch.notes = r.notes;
        if (r.stage) patch.stage = r.stage;
        if (r.likelyToClose !== null) patch.likely_to_close = r.likelyToClose;
        if (owner !== undefined) patch.assigned_employee_id = owner;
        const { error } = await db.from("leads").update(patch).eq("id", existing.id);
        if (error) problems.push({ row: rowNo, message: `${r.name}: ${error.message}` });
        else updated += 1;
        continue;
      }

      const { data: created, error } = await db
        .from("leads")
        .insert({
          name: r.name,
          mobile,
          source: r.source,
          product_interest: r.productInterest,
          expected_value: r.expectedValue,
          stage: r.stage || "new",
          likely_to_close: r.likelyToClose ?? false,
          assigned_employee_id: owner === undefined ? ctx.employeeId : owner,
          notes: r.notes,
          created_by: ctx.email,
        })
        .select("*")
        .single();
      if (error || !created) {
        problems.push({ row: rowNo, message: `${r.name}: ${error?.message || "couldn't be added"}` });
        continue;
      }
      if (mobile) openByMobile.set(mobile, created); // a repeat of this number later in the same file updates it
      added += 1;
    }

    await logAction(db, ctx.email, `🤝 Leads imported: ${added} added, ${updated} updated`, null, problems.length ? `${problems.length} skipped` : null);
    return NextResponse.json({ ok: true, added, updated, skipped: problems.length, problems: problems.slice(0, 50) });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Import failed");
  }
}
