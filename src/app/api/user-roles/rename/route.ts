import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  oldEmail: z.string().min(1),
  newEmail: z.string().min(1),
  role: z.enum(["admin", "manager", "sales", "tailor"]),
  phone: z.string().nullable().optional(),
  custom: z.record(z.string(), z.boolean()).nullable().optional(),
});

/** Re-keys a user's role row to a new email (their account identity changed). Same
 *  manageUsers gate as /api/user-roles — see that route's comment for why this moved
 *  server-side. Insert-then-delete, same order the old client-side mutation used. */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { oldEmail, newEmail, role, phone, custom } = parsed.data;

  const { error: insertError } = await supabase
    .from("user_roles")
    .insert({ email: newEmail, role, phone: phone ?? null, custom_permissions: custom || {} });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { error: deleteError } = await supabase.from("user_roles").delete().eq("email", oldEmail);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await logAction(supabase, user.email, `User renamed: ${oldEmail} → ${newEmail}`);
  return NextResponse.json({ ok: true });
}
