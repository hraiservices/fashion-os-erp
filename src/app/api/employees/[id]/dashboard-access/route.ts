import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizePhone } from "@/lib/auth-errors";
import { logAction } from "@/lib/logging";

/**
 * Consolidated "can this employee log into the dashboard app" control, replacing the old
 * two-page dance (Employees → Settings → Users → type an email → link → back to Employees →
 * set a phone number → set a PIN). An employee's own mobile number and self check-in PIN
 * (managed by /api/employees/[id]/set-pin) are now the ONLY credentials a dashboard login tied
 * to an employee ever needs — this route creates/links/updates the underlying user_roles row
 * with a synthetic email (same mechanism as /api/user-roles/provision-phone), so nobody ever has
 * to type or remember an email for the common case of "give this staff member dashboard access".
 */
const postSchema = z.object({
  enabled: z.boolean(),
  role: z.enum(["admin", "manager", "sales", "tailor"]).optional(),
  custom: z.record(z.string(), z.boolean()).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage users (missing service role key)" }, { status: 501 });

  const { data: row } = await serviceClient.from("user_roles").select("role, custom_permissions").eq("linked_employee_id", id).maybeSingle();
  if (!row) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: true, role: row.role, custom_permissions: row.custom_permissions || {} });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { enabled, role, custom } = parsed.data;

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage users (missing service role key)" }, { status: 501 });

  const { data: employee } = await serviceClient.from("employees").select("id, name, mobile").eq("id", id).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { data: existingLink } = await serviceClient.from("user_roles").select("email").eq("linked_employee_id", id).maybeSingle();

  if (!enabled) {
    if (existingLink) {
      // Non-destructive: unlinks the employee, but leaves the underlying login/account alone
      // (an admin can still find and manage it directly under Settings → Users if truly needed).
      await serviceClient.from("user_roles").update({ linked_employee_id: null }).eq("email", existingLink.email);
      await logAction(supabase, user.email, `Dashboard access removed for ${employee.name}`);
    }
    return NextResponse.json({ ok: true });
  }

  if (!role) return NextResponse.json({ error: "Choose a role" }, { status: 400 });

  const mobile = normalizePhone(employee.mobile || "");
  if (mobile.length !== 10) return NextResponse.json({ error: "This employee needs a valid mobile number first (see Basic info above) — dashboard login uses it to sign in." }, { status: 400 });

  if (existingLink) {
    // Already linked — just update role/permissions/phone (mobile may have changed since linking).
    const { error } = await serviceClient.from("user_roles").update({ role, custom_permissions: custom || {}, phone: mobile }).eq("email", existingLink.email);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAction(supabase, user.email, `Dashboard access updated for ${employee.name}`);
    return NextResponse.json({ ok: true });
  }

  // No login linked to this employee yet. A stray user_roles row could already have this exact
  // phone number (e.g. provisioned the old way, pre-merge) — link that instead of creating a
  // second, colliding one; otherwise create a brand-new phone+PIN login for this employee.
  const { data: samePhone } = await serviceClient.from("user_roles").select("email, linked_employee_id").eq("phone", mobile).maybeSingle();
  if (samePhone) {
    if (samePhone.linked_employee_id) return NextResponse.json({ error: "This mobile number is already linked to a different employee's dashboard login." }, { status: 409 });
    const { error } = await serviceClient
      .from("user_roles")
      .update({ role, custom_permissions: custom || {}, linked_employee_id: id })
      .eq("email", samePhone.email);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAction(supabase, user.email, `Dashboard access enabled for ${employee.name}`);
    return NextResponse.json({ ok: true });
  }

  const syntheticEmail = `emp-${id}@dashboard.local`;
  const throwawayPassword = randomBytes(24).toString("base64url");

  const { error: createError } = await serviceClient.auth.admin.createUser({ email: syntheticEmail, password: throwawayPassword, email_confirm: true });
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

  const { error: insertError } = await serviceClient.from("user_roles").insert({
    email: syntheticEmail,
    phone: mobile,
    role,
    custom_permissions: custom || {},
    linked_employee_id: id,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await logAction(supabase, user.email, `Dashboard access enabled for ${employee.name}`);
  return NextResponse.json({ ok: true });
}
