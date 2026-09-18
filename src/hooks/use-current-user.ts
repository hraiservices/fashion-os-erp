"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { isRestrictedRole, resolvePerms, type Permissions, type RoleDefaultOverrides } from "@/lib/permissions";

export interface CurrentUser {
  email: string;
  role: string;
  perms: Permissions;
  restricted: boolean;
  /** Platform owner, identified by a fixed env-var email — governs module licensing, not per-shop roles/permissions. */
  isSuperAdmin: boolean;
  /** The employees row this login is linked to (user_roles.linked_employee_id), if any — lets
   *  the UI show "your own" employee data (e.g. My Payslips) without the managePayroll permission. */
  employeeId: string | null;
  /** Name/photo off that same linked employee row, for the topbar avatar/menu — null unless
   *  employeeId is also set. */
  employeeName: string | null;
  employeePhotoUrl: string | null;
}

function checkSuperAdmin(email: string): boolean {
  const ownerEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;
  return !!ownerEmail && email.toLowerCase() === ownerEmail.toLowerCase();
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const [{ data: roleRow }, { data: overridesRow }] = await Promise.all([
    supabase.from("user_roles").select("role, custom_permissions, linked_employee_id").eq("email", user.email).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "roleDefaultOverrides").maybeSingle(),
  ]);

  const role = roleRow?.role || "tailor";
  const perms = resolvePerms(role, roleRow?.custom_permissions as Partial<Permissions> | null, overridesRow?.value as RoleDefaultOverrides | null);
  const employeeId: string | null = roleRow?.linked_employee_id ?? null;

  let employeeName: string | null = null;
  let employeePhotoUrl: string | null = null;
  if (employeeId) {
    const { data: employeeRow } = await supabase.from("employees").select("name, photo_url").eq("id", employeeId).maybeSingle();
    employeeName = employeeRow?.name ?? null;
    employeePhotoUrl = employeeRow?.photo_url ?? null;
  }

  return {
    email: user.email,
    role,
    perms,
    restricted: isRestrictedRole(role),
    isSuperAdmin: checkSuperAdmin(user.email),
    employeeId,
    employeeName,
    employeePhotoUrl,
  };
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
  });
}
