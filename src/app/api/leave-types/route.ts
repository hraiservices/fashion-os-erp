import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { mapLeaveTypeRow } from "@/lib/types";
import { logAction } from "@/lib/logging";

/** GET has no permission gate (any logged-in app user can read leave types — needed for the
 *  employee detail page and reports, not just Settings). Self-service (/checkin, PIN-session)
 *  does NOT call this route — it has no Supabase Auth session so RLS would block it; it fetches
 *  leave types itself via a service-role client (see /api/attendance/leave-balance). Mutations
 *  below are admin/manager-only. */
export async function GET() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data, error } = await supabase.from("leave_types").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leaveTypes: (data || []).map(mapLeaveTypeRow) });
}

const bodySchema = z.object({
  name: z.string().min(1),
  annualDays: z.number().min(0),
  paid: z.boolean(),
  carryForward: z.boolean(),
  maxCarryForwardDays: z.number().min(0).nullable().optional(),
  active: z.boolean().optional(),
});

export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const { data, error } = await supabase
    .from("leave_types")
    .insert({
      name: fd.name,
      annual_days: fd.annualDays,
      paid: fd.paid,
      carry_forward: fd.carryForward,
      max_carry_forward_days: fd.maxCarryForwardDays ?? null,
      active: fd.active ?? true,
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });

  await logAction(supabase, user.email, `Leave type created: ${fd.name}`);
  return NextResponse.json({ leaveType: mapLeaveTypeRow(data) });
}
