import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { normalizePhone } from "@/lib/auth-errors";

const bodySchema = z.object({
  email: z.string().min(1),
  employeeId: z.string().uuid().nullable(),
});

/**
 * The single place `user_roles.linked_employee_id` is ever written — called from both the
 * Users & Roles picker (picks an employee for a given login) and the Employee form's picker
 * (picks a login for a given employee), so the two UIs never need their own bespoke logic for
 * this shared column. Same manageUsers gate as every other /api/user-roles/* route, and the
 * same service-role write (RLS on user_roles blocks `authenticated` writes entirely).
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { email, employeeId } = parsed.data;

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage users (missing service role key)" }, { status: 501 });

  if (employeeId) {
    // Enforce one-to-one by moving the link rather than erroring — the picker UIs already
    // exclude an employee that's linked elsewhere, so this only fires on a genuine race
    // between two admins, not in normal single-user use.
    await serviceClient.from("user_roles").update({ linked_employee_id: null }).eq("linked_employee_id", employeeId).neq("email", email);
  }

  // Phone+PIN dashboard login (see /api/auth/phone-login) looks up `user_roles.phone`, which
  // linking alone never populated — an admin had to separately set it under Settings → Users,
  // so a freshly linked employee could log in via email but not via their own phone number
  // even though they have a PIN. Backfill it from the employee's own mobile on link, same
  // normalization as the manual phone field, but only when this login doesn't already have one
  // set so a deliberate admin choice is never silently overwritten.
  if (employeeId) {
    const { data: row } = await serviceClient.from("user_roles").select("phone").eq("email", email).maybeSingle();
    if (!row?.phone) {
      const { data: employee } = await serviceClient.from("employees").select("mobile").eq("id", employeeId).maybeSingle();
      const mobile = employee?.mobile ? normalizePhone(employee.mobile) : "";
      // No DB-level unique constraint on phone — silently backfilling a number some other
      // login already has would make phone-login's by-phone lookup match two rows and fail
      // both of them. Skip the backfill in that case; the admin can still resolve the
      // collision manually via the phone field's own 409 check in /api/user-roles/phone.
      if (mobile.length === 10) {
        const { data: collision } = await serviceClient.from("user_roles").select("email").eq("phone", mobile).neq("email", email).maybeSingle();
        if (!collision) await serviceClient.from("user_roles").update({ phone: mobile }).eq("email", email);
      }
    }
  }

  const { error } = await serviceClient.from("user_roles").update({ linked_employee_id: employeeId }).eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, employeeId ? `User ${email} linked to employee ${employeeId}` : `User ${email} unlinked from employee`);
  return NextResponse.json({ ok: true });
}
