import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { isValidPin, hashPin } from "@/lib/attendance-auth";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({ pin: z.string() });

/**
 * Every handler here reaches `employees` through the service-role client, for two reasons that
 * both land on this one table: `authenticated` no longer holds SELECT on pin_hash
 * (lockdown_pin_hash_columns.sql), and it no longer holds INSERT/UPDATE/DELETE on employees at
 * all (lockdown_hr_payroll_writes.sql). The manageEmployees check below is what authorises the
 * call — the same check that was already here; only the client underneath it changed.
 */
/**
 * Refuses a PIN change on an employee whose record backs a dashboard login, unless the caller
 * is an admin or it is their own record.
 *
 * manageEmployees is enough to set an ordinary attendance PIN, and the `manager` role holds it
 * by default while holding none of manageUsers / managePayroll / viewFinancialReports. But a
 * PIN is not only an attendance PIN: when user_roles.linked_employee_id points at an employee,
 * /api/auth/phone-login authenticates that dashboard login against *this* employee's pin_hash
 * and mints a real Supabase session from it. So a manager could set a PIN of their choosing on
 * the owner's linked employee row and then log in as the owner — payroll, KYC, API keys, user
 * management, everything manageEmployees deliberately does not grant.
 *
 * Same literal-admin stance as the KYC document routes, and for the same reason: the gate has
 * to be tighter than the permission flag that would otherwise cover it.
 */
async function blockedLinkedLoginResponse(
  serviceClient: NonNullable<ReturnType<typeof createServiceClient>>,
  employeeId: string,
  caller: { email: string; role: string }
): Promise<NextResponse | null> {
  const { data: linkedLogin, error } = await serviceClient
    .from("user_roles")
    .select("email, role")
    .eq("linked_employee_id", employeeId)
    .maybeSingle();
  // Fails closed: if we cannot tell whether this employee backs a login, we do not change the
  // PIN. Reading this wrong in the permissive direction is the whole vulnerability.
  if (error) return NextResponse.json({ error: `Couldn't verify whether this employee has a dashboard login — ${error.message}` }, { status: 500 });
  if (!linkedLogin) return null;
  if (linkedLogin.email === caller.email) return null;
  if (caller.role === "admin") return null;
  return NextResponse.json(
    {
      error: `${linkedLogin.email} signs in to the dashboard with this employee's PIN, so only an admin can change it. Ask an admin, or have them sign in and change it themselves.`,
    },
    { status: 403 }
  );
}

function serviceOr501() {
  const serviceClient = createServiceClient();
  if (!serviceClient) {
    return { serviceClient: null, error: NextResponse.json({ error: "Server is not configured to manage employees (missing service role key)" }, { status: 501 }) };
  }
  return { serviceClient, error: null };
}

/** Tells the employee edit form whether a PIN is currently set, without ever exposing the hash. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const { serviceClient, error } = serviceOr501();
  if (!serviceClient) return error;

  const { data: employee } = await serviceClient.from("employees").select("pin_hash").eq("id", id).maybeSingle();
  return NextResponse.json({ hasPin: !!employee?.pin_hash });
}

/**
 * Sets/changes an employee's self-service attendance PIN. Server-only — the hash is written
 * here and NEVER returned in the response, so the browser sees only { ok: true }. Gated on
 * manageEmployees (the same permission that lets you edit the employee's other details).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  if (!isValidPin(parsed.data.pin)) return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });

  const { serviceClient, error: configError } = serviceOr501();
  if (!serviceClient) return configError;

  const { data: employee } = await serviceClient.from("employees").select("id, name").eq("id", id).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const blocked = await blockedLinkedLoginResponse(serviceClient, id, user);
  if (blocked) return blocked;

  const pin_hash = await hashPin(parsed.data.pin);
  const { error } = await serviceClient.from("employees").update({ pin_hash }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Attendance PIN set for ${employee.name}`);
  return NextResponse.json({ ok: true });
}

/** Removes an employee's PIN, disabling their self-service check-in until a new one is set. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const { serviceClient, error: configError } = serviceOr501();
  if (!serviceClient) return configError;

  const { data: employee } = await serviceClient.from("employees").select("id, name").eq("id", id).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  // Gated the same way as POST: clearing the PIN of an employee who backs a dashboard login
  // locks that person out of the dashboard, which is not a manager's call to make either.
  const blocked = await blockedLinkedLoginResponse(serviceClient, id, user);
  if (blocked) return blocked;

  const { error } = await serviceClient.from("employees").update({ pin_hash: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Attendance PIN removed for ${employee.name}`);
  return NextResponse.json({ ok: true });
}
