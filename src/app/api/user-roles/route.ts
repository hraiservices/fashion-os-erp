import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/**
 * Sets/updates a user's role and custom permission overrides.
 *
 * P0 fix: this used to be a direct browser-to-Supabase upsert (src/hooks/use-user-roles.ts),
 * with `user_roles` RLS wide open (`USING (true) WITH CHECK (true)`, no migration ever
 * authored for this table) — any authenticated user, including a tailor, could set their own
 * row to role: "admin" from the browser console and every permission check in every API route
 * would then pass for them, since getServerUser() resolves permissions from this exact table.
 * Routing through here closes that: only a caller who already holds manageUsers can change
 * anyone's role. (First-user bootstrap is unaffected — that's ensureUserRole() in
 * src/lib/supabase/role-bootstrap.ts, a separate server-side path not exposed by this route.)
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

  const { error } = await supabase
    .from("user_roles")
    .upsert({ email: email.trim().toLowerCase(), role, custom_permissions: custom || {} });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `User role set: ${email} → ${role}`);
  return NextResponse.json({ ok: true });
}
