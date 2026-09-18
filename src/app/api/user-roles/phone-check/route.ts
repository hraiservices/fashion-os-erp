import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizePhone } from "@/lib/auth-errors";

/**
 * Read-only diagnostic for "why can't this mobile number log in" — mirrors the exact lookup
 * /api/auth/phone-login does (including the linked-employee PIN indirection) so an admin can see
 * the real stored state instead of guessing from the login page's necessarily generic error.
 * Never returns the PIN hash itself, only whether one is set.
 */
export async function GET(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const raw = new URL(request.url).searchParams.get("phone") || "";
  const phone = normalizePhone(raw);
  if (phone.length !== 10) return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage users (missing service role key)" }, { status: 501 });

  const { data: rows, error } = await serviceClient
    .from("user_roles")
    .select("email, linked_employee_id, pin_hash, pin_locked_until")
    .eq("phone", phone);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!rows || rows.length === 0) return NextResponse.json({ found: false });
  if (rows.length > 1) {
    return NextResponse.json({ found: true, collision: true, emails: rows.map((r) => r.email) });
  }

  const row = rows[0];
  let hasPin = !!row.pin_hash;
  let lockedUntil = row.pin_locked_until;
  let linkedEmployeeName: string | null = null;

  if (row.linked_employee_id) {
    const { data: employee } = await serviceClient
      .from("employees")
      .select("name, pin_hash, pin_locked_until")
      .eq("id", row.linked_employee_id)
      .maybeSingle();
    hasPin = !!employee?.pin_hash;
    lockedUntil = employee?.pin_locked_until ?? null;
    linkedEmployeeName = employee?.name ?? null;
  }

  const locked = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now();

  return NextResponse.json({
    found: true,
    collision: false,
    email: row.email,
    linkedEmployeeId: row.linked_employee_id,
    linkedEmployeeName,
    hasPin,
    locked,
    lockedUntil,
  });
}
