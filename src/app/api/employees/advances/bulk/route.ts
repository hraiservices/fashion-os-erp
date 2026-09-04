import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { getPieceRateAdvanceCap } from "@/lib/piece-rate";
import { partitionBulkAdvances, type BulkAdvanceEntry } from "@/lib/payroll";

/**
 * Context the Weekly Advances screen needs before anyone types an amount: who's active, and —
 * for a piece-rate tailor — the most they can be advanced right now, so the admin isn't finding
 * out at submit time that a number they typed was too high. Non-piece-rate employees have no
 * cap (a manager judgment call, same as the single-employee advance route), so they get `null`
 * rather than a number that would look like a real limit.
 */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const [{ data: employeeRows, error: empError }, { data: advanceRows, error: advError }] = await Promise.all([
    db.from("employees").select("id, name, role, piece_rate_eligible").eq("active", true).order("name"),
    db.from("employee_advances").select("employee_id, amount").is("payslip_id", null),
  ]);
  if (empError) return NextResponse.json({ error: empError.message }, { status: 500 });
  if (advError) return NextResponse.json({ error: advError.message }, { status: 500 });

  const outstandingByEmployee = new Map<string, number>();
  for (const row of advanceRows || []) {
    outstandingByEmployee.set(row.employee_id, (outstandingByEmployee.get(row.employee_id) || 0) + row.amount);
  }

  const pieceRateEmployees = (employeeRows || []).filter((e) => e.piece_rate_eligible);
  const caps = await Promise.all(pieceRateEmployees.map((e) => getPieceRateAdvanceCap(db, e.id)));
  const capByEmployeeId = new Map(pieceRateEmployees.map((e, i) => [e.id, caps[i]]));

  const employees = (employeeRows || []).map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role,
    pieceRateEligible: e.piece_rate_eligible,
    pieceRateCap: e.piece_rate_eligible ? capByEmployeeId.get(e.id) ?? 0 : null,
    outstandingAdvances: outstandingByEmployee.get(e.id) || 0,
  }));

  return NextResponse.json({ employees });
}

const entrySchema = z.object({
  employeeId: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().optional().default(""),
});
const bodySchema = z.object({
  date: z.string().min(1),
  entries: z.array(entrySchema).min(1),
});

/**
 * Records a whole batch of advances in one go — built for the weekly (often Saturday) round
 * where several tailors each draw an advance at once, so a manager isn't opening nine separate
 * employee pages to do the same thing nine times. Partial success is normal here, not an
 * error: one tailor over their piece-rate cap doesn't block the other eight, it's reported back
 * as a skip so the manager can see exactly who and why.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { date, entries } = parsed.data;

  const employeeIds = [...new Set(entries.map((e) => e.employeeId))];
  const { data: employeeRows, error: empError } = await db
    .from("employees")
    .select("id, piece_rate_eligible")
    .in("id", employeeIds);
  if (empError) return NextResponse.json({ error: empError.message }, { status: 500 });

  const knownIds = new Set((employeeRows || []).map((e) => e.id));
  const unknownEntries = entries.filter((e) => !knownIds.has(e.employeeId));
  const knownEntries: BulkAdvanceEntry[] = entries.filter((e) => knownIds.has(e.employeeId));

  const pieceRateEligibleIds = new Set((employeeRows || []).filter((e) => e.piece_rate_eligible).map((e) => e.id));
  const pieceRateEntryIds = knownEntries.filter((e) => pieceRateEligibleIds.has(e.employeeId)).map((e) => e.employeeId);
  const caps = await Promise.all(pieceRateEntryIds.map((id) => getPieceRateAdvanceCap(db, id)));
  const capsByEmployeeId = new Map(pieceRateEntryIds.map((id, i) => [id, caps[i]]));

  const { valid, skipped } = partitionBulkAdvances(knownEntries, pieceRateEligibleIds, capsByEmployeeId);
  const allSkipped = [...skipped, ...unknownEntries.map((e) => ({ employeeId: e.employeeId, reason: "Employee not found or inactive" }))];

  if (valid.length > 0) {
    const { error: insertError } = await db.from("employee_advances").insert(
      valid.map((e) => ({ employee_id: e.employeeId, date, amount: e.amount, note: e.note || "", created_by: user.email }))
    );
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    const total = valid.reduce((sum, e) => sum + e.amount, 0);
    await logAction(
      supabase,
      user.email,
      `Bulk advance recorded: ₹${total} across ${valid.length} employee${valid.length === 1 ? "" : "s"} for ${date}`,
      undefined,
      allSkipped.length ? `${allSkipped.length} skipped: ${allSkipped.map((s) => `${s.employeeId} (${s.reason})`).join("; ")}` : undefined
    );
  }

  return NextResponse.json({ inserted: valid.length, skipped: allSkipped });
}
