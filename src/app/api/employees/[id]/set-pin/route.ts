import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { isValidPin, hashPin } from "@/lib/attendance-auth";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({ pin: z.string() });

/** Tells the employee edit form whether a PIN is currently set, without ever exposing the hash. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const { data: employee } = await supabase.from("employees").select("pin_hash").eq("id", id).maybeSingle();
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

  const { data: employee } = await supabase.from("employees").select("id, name").eq("id", id).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const pin_hash = await hashPin(parsed.data.pin);
  const { error } = await supabase.from("employees").update({ pin_hash }).eq("id", id);
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

  const { data: employee } = await supabase.from("employees").select("id, name").eq("id", id).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { error } = await supabase.from("employees").update({ pin_hash: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Attendance PIN removed for ${employee.name}`);
  return NextResponse.json({ ok: true });
}
