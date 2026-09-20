import { createClient } from "@/lib/supabase/server";
import { getCachedAppSetting } from "@/lib/supabase/app-settings-cache";
import { resolvePerms, type Permissions, type RoleDefaultOverrides } from "@/lib/permissions";

export interface ServerUser {
  email: string;
  role: string;
  perms: Permissions;
  /** The employees row this login is linked to (user_roles.linked_employee_id), if any — lets
   *  a route scope access to "your own" employee data (e.g. your own payslips) without the
   *  managePayroll permission. Null for a login with no linked staff record. */
  employeeId: string | null;
}

/** Loads the authenticated user + resolved permissions for use inside API route handlers. */
export async function getServerUser(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; user: ServerUser | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { supabase, user: null };

  // roleDefaultOverrides is short-TTL cached (app-settings-cache.ts) — this runs at the top of
  // nearly every API route with zero caching, confirmed by a live performance audit as ~30% of
  // total request volume. Role overrides are already soft/fail-open by design (resolvePerms
  // falls back to the built-in role defaults on a missing/null override), so a few seconds of
  // staleness after an admin changes them is an accepted, deliberate tradeoff. user_roles itself
  // is NOT cached here — it's per-user identity data, not a shop-wide setting.
  const [{ data: roleRow }, overridesValue] = await Promise.all([
    supabase.from("user_roles").select("role, custom_permissions, linked_employee_id").eq("email", user.email).maybeSingle(),
    getCachedAppSetting(supabase, "roleDefaultOverrides"),
  ]);

  const role = roleRow?.role || "tailor";
  const perms = resolvePerms(role, roleRow?.custom_permissions as Partial<Permissions> | null, overridesValue as RoleDefaultOverrides | null);

  return { supabase, user: { email: user.email, role, perms, employeeId: roleRow?.linked_employee_id ?? null } };
}
