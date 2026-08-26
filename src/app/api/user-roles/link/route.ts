import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  email: z.string().min(1),
  employeeId: z.string().uuid().nullable(),
});

/**
 * The single place `user_roles.linked_employee_id` is ever written — called from both the
 * Users & Roles picker (picks an employee for a given login) and the Employee form's picker
 * (picks a login for a given employee), so the two UIs never need their own bespoke logic for
 * this shared column. Same manageUsers gate as every other /api/user-roles/* route.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { email, employeeId } = parsed.data;

  if (employeeId) {
    // Enforce one-to-one by moving the link rather than erroring — the picker UIs already
    // exclude an employee that's linked elsewhere, so this only fires on a genuine race
    // between two admins, not in normal single-user use.
    await supabase.from("user_roles").update({ linked_employee_id: null }).eq("linked_employee_id", employeeId).neq("email", email);
  }

  const { error } = await supabase.from("user_roles").update({ linked_employee_id: employeeId }).eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, employeeId ? `User ${email} linked to employee ${employeeId}` : `User ${email} unlinked from employee`);
  return NextResponse.json({ ok: true });
}
