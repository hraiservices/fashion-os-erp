import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

/**
 * Sets/updates a user's role and custom permission overrides.
 *
 * P0 fix (incomplete until now): this used to be a direct browser-to-Supabase upsert
 * (src/hooks/use-user-roles.ts). Moving the APP's own call through this route only closed the
 * path the app's own UI uses — `user_roles` RLS was still permissive for every authenticated
 * client regardless of which code called it, so anyone could bypass this route entirely and
 * run `supabase.from('user_roles').upsert({email: 'me@x.com', role: 'admin'})` straight from
 * the browser console, since getServerUser() resolves every permission check from this exact
 * table. lockdown_user_roles_writes.sql now blocks INSERT/UPDATE/DELETE on user_roles for the
 * `authenticated` role entirely (SELECT is untouched — every request still needs to read its
 * own row) — only the service-role client, used below after the manageUsers check has already
 * passed, can write it now.
 */
const bodySchema = z.object({
  email: z.string().min(1),
  role: z.enum(["admin", "manager", "sales", "tailor"]),
  custom: z.record(z.string(), z.boolean()).optional(),
});

export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { email, role, custom } = parsed.data;

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage users (missing service role key)" }, { status: 501 });

  const { error } = await serviceClient
    .from("user_roles")
    .upsert({ email: email.trim().toLowerCase(), role, custom_permissions: custom || {} });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `User role set: ${email} → ${role}`);
  return NextResponse.json({ ok: true });
}
