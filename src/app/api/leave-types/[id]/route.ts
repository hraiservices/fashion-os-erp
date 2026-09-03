import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapLeaveTypeRow } from "@/lib/types";
import { logAction } from "@/lib/logging";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  annualDays: z.number().min(0).optional(),
  paid: z.boolean().optional(),
  carryForward: z.boolean().optional(),
  maxCarryForwardDays: z.number().min(0).nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const { data, error } = await db
    .from("leave_types")
    .update({
      ...(fd.name !== undefined ? { name: fd.name } : {}),
      ...(fd.annualDays !== undefined ? { annual_days: fd.annualDays } : {}),
      ...(fd.paid !== undefined ? { paid: fd.paid } : {}),
      ...(fd.carryForward !== undefined ? { carry_forward: fd.carryForward } : {}),
      ...(fd.maxCarryForwardDays !== undefined ? { max_carry_forward_days: fd.maxCarryForwardDays } : {}),
      ...(fd.active !== undefined ? { active: fd.active } : {}),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Leave type not found" }, { status: 404 });

  await logAction(supabase, user.email, `Leave type updated: ${data.name}`);
  return NextResponse.json({ leaveType: mapLeaveTypeRow(data) });
}

/** Deactivate rather than delete when the type has any leave requests — deleting would orphan
 *  historical requests/balances (FK RESTRICT would just fail the delete anyway; this gives a
 *  friendlier message instead of a raw constraint error). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { count } = await db.from("leave_requests").select("id", { count: "exact", head: true }).eq("leave_type_id", id);
  if (count && count > 0) {
    const { data, error } = await db.from("leave_types").update({ active: false }).eq("id", id).select("name").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAction(supabase, user.email, `Leave type deactivated (has requests, not deleted): ${data?.name}`);
    return NextResponse.json({ ok: true, deactivated: true });
  }

  const { data, error } = await db.from("leave_types").delete().eq("id", id).select("name").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(supabase, user.email, `Leave type deleted: ${data?.name}`);
  return NextResponse.json({ ok: true, deactivated: false });
}
