import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { getPieceRateAdvanceCap } from "@/lib/piece-rate";

/** Records an advance/loan against an employee. Server-side so managePayroll is enforced —
 *  this used to be a direct browser-to-Supabase insert with no permission check. */
const bodySchema = z.object({
  date: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().optional().default(""),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  // Write-locked for `authenticated` — see lockdown_hr_payroll_writes.sql. The permission
  // check above is what authorises this; logAction keeps using the caller's own session so
  // the audit trail still names the real actor.
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { date, amount, note } = parsed.data;

  // Piece-rate tailors can only draw an advance against what they've actually earned so far —
  // salaried employees keep today's uncapped behavior (a manager judgment call), unchanged.
  const { data: employeeRow } = await db.from("employees").select("piece_rate_eligible").eq("id", id).maybeSingle();
  if (employeeRow?.piece_rate_eligible) {
    const cap = await getPieceRateAdvanceCap(supabase, id);
    if (amount > cap) {
      return NextResponse.json({ error: `This tailor has only ₹${cap} in confirmed, unpaid piece-rate earnings — can't advance more than that.` }, { status: 409 });
    }
  }

  const { error } = await db.from("employee_advances").insert({ employee_id: id, date, amount, note, created_by: user.email });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Advance recorded: ₹${amount}`, undefined, `Employee: ${id}`);
  return NextResponse.json({ ok: true });
}
