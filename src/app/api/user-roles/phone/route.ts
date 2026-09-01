import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  email: z.string().min(1),
  phone: z.string().nullable(),
});

/** Sets a user's phone (used for the attendance/self-service PIN portal linkage). Same
 *  manageUsers gate as /api/user-roles — see that route's comment for why this moved
 *  server-side, and why the write itself uses the service-role client. */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { email, phone } = parsed.data;

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage users (missing service role key)" }, { status: 501 });

  // No DB-level unique constraint on phone, and phone-login looks a row up by phone alone
  // (see /api/auth/phone-login) — two logins sharing a number makes that lookup ambiguous and
  // silently fails both of them (a Postgrest "multiple rows" error, swallowed as "not found").
  // Reject the collision here instead of letting it happen silently.
  if (phone) {
    const { data: existing } = await serviceClient.from("user_roles").select("email").eq("phone", phone).neq("email", email).maybeSingle();
    if (existing) return NextResponse.json({ error: `That number is already used by ${existing.email}` }, { status: 409 });
  }

  const { error } = await serviceClient.from("user_roles").update({ phone }).eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `User phone updated: ${email}`);
  return NextResponse.json({ ok: true });
}
