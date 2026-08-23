import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

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

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { date, amount, note } = parsed.data;

  const { error } = await supabase.from("employee_advances").insert({ employee_id: id, date, amount, note, created_by: user.email });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Advance recorded: ₹${amount}`, undefined, `Employee: ${id}`);
  return NextResponse.json({ ok: true });
}
