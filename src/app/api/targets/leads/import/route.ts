import { NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { OPEN_STAGES } from "@/lib/lead-stages";
import { LEAD_IMPORT_MAX_ROWS } from "@/lib/lead-import";
import { parseBody, serverError } from "@/lib/targets-api";
import { inBatches, loadStaff, targetsContext } from "@/lib/targets-server";
import { planLeadImport, type ImportOp } from "@/lib/lead-import-plan";
import { logAction } from "@/lib/logging";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

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
 *
 * The file is worked out first and then written in batches (new leads in groups, updates a few at a
 * time) — one database round trip per row made a 1,000-row file slow enough to time out.
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

    // Only the open leads whose numbers appear in this file — not every open lead in the shop (a single query
    // would stop at 1000 rows and miss duplicates beyond that).
    const fileMobiles = Array.from(new Set(body.data.rows.map((r) => (r.mobile ? normalizeIndianMobile(r.mobile) : "")).filter((m) => m.length >= 10)));
    const openLeads: LeadRow[] = fileMobiles.length ? await inBatches<LeadRow>(fileMobiles, (ms) => db.from("leads").select("*").in("stage", [...OPEN_STAGES]).in("mobile", ms)) : [];

    const { ops, problems } = planLeadImport(body.data.rows, staff, openLeads, { employeeId: ctx.employeeId, email: ctx.email, seesAll: ctx.seesAll, canAssignOthers: ctx.seesAll || ctx.perms.assignTasks }, new Date().toISOString());

    let added = 0;
    let updated = 0;

    // New leads: one request per 100. If a batch is refused, fall back to one at a time so the bad row is named.
    const inserts = ops.filter((o): o is Extract<ImportOp, { kind: "insert" }> => o.kind === "insert");
    for (let i = 0; i < inserts.length; i += 100) {
      const batch = inserts.slice(i, i + 100);
      const { error } = await db.from("leads").insert(batch.map((o) => o.row));
      if (!error) {
        added += batch.length;
        continue;
      }
      for (const o of batch) {
        const { error: one } = await db.from("leads").insert(o.row);
        if (one) problems.push({ row: o.rowNo, message: `${o.name}: ${one.message}` });
        else added += 1;
      }
    }

    // Updates: a handful at a time.
    const updates = ops.filter((o): o is Extract<ImportOp, { kind: "update" }> => o.kind === "update");
    for (let i = 0; i < updates.length; i += 10) {
      await Promise.all(
        updates.slice(i, i + 10).map(async (o) => {
          const { error } = await db.from("leads").update(o.patch).eq("id", o.id);
          if (error) problems.push({ row: o.rowNo, message: `${o.name}: ${error.message}` });
          else updated += 1;
        })
      );
    }

    problems.sort((a, b) => a.row - b.row);
    after(() => logAction(db, ctx.email, `🤝 Leads imported: ${added} added, ${updated} updated`, null, problems.length ? `${problems.length} skipped` : null));
    return NextResponse.json({ ok: true, added, updated, skipped: problems.length, problems: problems.slice(0, 50) });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Import failed");
  }
}
