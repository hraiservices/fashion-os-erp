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

  const { error } = await serviceClient.from("employees").update({ pin_hash: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Attendance PIN removed for ${employee.name}`);
  return NextResponse.json({ ok: true });
}
