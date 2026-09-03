import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { isValidPin, hashPin } from "@/lib/attendance-auth";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  email: z.string().min(1),
  pin: z.string().nullable(),
});

/** Tells the Users & Roles UI whether a PIN is currently set, without ever exposing the hash —
 *  same reasoning and shape as GET /api/employees/[id]/set-pin. */
export async function GET(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const email = new URL(request.url).searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  // Service-role client: `authenticated` no longer holds SELECT on pin_hash at all — see
  // lockdown_pin_hash_columns.sql. Only the boolean ever leaves this route.
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage users (missing service role key)" }, { status: 501 });

  const { data: row } = await serviceClient.from("user_roles").select("pin_hash").eq("email", email).maybeSingle();
  return NextResponse.json({ hasPin: !!row?.pin_hash });
}

/**
 * Set/change/clear a dashboard login's own PIN. Mirrors /api/user-roles/phone exactly (same
 * gate, same service-role write — user_roles writes are locked down to service-role only, see
 * lockdown_user_roles_writes.sql).
 *
 * Only for an UNLINKED row — a user linked to an employee shares that employee's attendance PIN
 * instead (see add_dashboard_pin_login.sql), so there is never a second PIN to keep in sync.
 * The Users & Roles UI doesn't offer this control for a linked row either, but this route
 * enforces it too.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { email, pin } = parsed.data;

  const { data: row } = await supabase.from("user_roles").select("linked_employee_id").eq("email", email).maybeSingle();
  if (!row) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (row.linked_employee_id) {
    return NextResponse.json({ error: "This user is linked to an employee and shares that employee's attendance PIN — set it from the employee's own record instead." }, { status: 400 });
  }

  if (pin !== null && !isValidPin(pin)) return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage users (missing service role key)" }, { status: 501 });

  const pin_hash = pin ? await hashPin(pin) : null;
  const { error } = await serviceClient
    .from("user_roles")
    .update({ pin_hash, failed_pin_attempts: 0, pin_locked_until: null })
    .eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, pin ? `PIN set for ${email}` : `PIN removed for ${email}`);
  return NextResponse.json({ ok: true });
}
