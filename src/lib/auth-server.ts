import { createClient } from "@/lib/supabase/server";
import { resolvePerms, type Permissions } from "@/lib/permissions";

export interface ServerUser {
  email: string;
  role: string;
  perms: Permissions;
}

/** Loads the authenticated user + resolved permissions for use inside API route handlers. */
export async function getServerUser(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; user: ServerUser | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { supabase, user: null };

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, custom_permissions")
    .eq("email", user.email)
    .maybeSingle();

  const role = roleRow?.role || "tailor";
  const perms = resolvePerms(role, roleRow?.custom_permissions as Partial<Permissions> | null);

  return { supabase, user: { email: user.email, role, perms } };
}
