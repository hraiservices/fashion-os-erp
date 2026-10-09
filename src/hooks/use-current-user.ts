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

interface RoleContext {
  role: string;
  customPermissions: Partial<Permissions> | null;
  roleDefaultOverrides: RoleDefaultOverrides | null;
  employeeId: string | null;
  employeeName: string | null;
  employeePhotoUrl: string | null;
}

/**
 * One Postgres round trip via get_current_user_context() (supabase/migrations/
 * add_current_user_context_rpc.sql) instead of up to three sequential ones — this runs on every
 * protected page's first paint, every cold app open, so each extra serial round trip was real
 * latency on the critical path (same audit that found /launch doing a redundant full page load).
 * Falls back to the original three-query path on any RPC error, including "function does not
 * exist" for a customer deployment whose Supabase project hasn't picked up that migration yet —
 * migrations in this repo are applied by hand / via scripts/onboard-customer.mjs, not tracked
 * automatically, so this has to work whether or not a given project has it yet.
 */
async function fetchRoleContext(supabase: ReturnType<typeof createClient>, email: string): Promise<RoleContext> {
  const { data, error } = await supabase.rpc("get_current_user_context").maybeSingle();
  if (!error && data) {
    return {
      role: data.role || "tailor",
      customPermissions: data.custom_permissions as Partial<Permissions> | null,
      roleDefaultOverrides: data.role_default_overrides as RoleDefaultOverrides | null,
      employeeId: data.linked_employee_id,
      employeeName: data.employee_name,
      employeePhotoUrl: data.employee_photo_url,
    };
  }

  const [{ data: roleRow }, { data: overridesRow }] = await Promise.all([
    supabase.from("user_roles").select("role, custom_permissions, linked_employee_id").eq("email", email).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "roleDefaultOverrides").maybeSingle(),
  ]);

  const employeeId: string | null = roleRow?.linked_employee_id ?? null;
  let employeeName: string | null = null;
  let employeePhotoUrl: string | null = null;
  if (employeeId) {
    const { data: employeeRow } = await supabase.from("employees").select("name, photo_url").eq("id", employeeId).maybeSingle();
    employeeName = employeeRow?.name ?? null;
    employeePhotoUrl = employeeRow?.photo_url ?? null;
  }

  return {
    role: roleRow?.role || "tailor",
    customPermissions: roleRow?.custom_permissions as Partial<Permissions> | null,
    roleDefaultOverrides: overridesRow?.value as RoleDefaultOverrides | null,
    employeeId,
    employeeName,
    employeePhotoUrl,
  };
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const ctx = await fetchRoleContext(supabase, user.email);
  const perms = resolvePerms(ctx.role, ctx.customPermissions, ctx.roleDefaultOverrides);

  return {
    email: user.email,
    role: ctx.role,
    perms,
    restricted: isRestrictedRole(ctx.role),
    isSuperAdmin: checkSuperAdmin(user.email),
    employeeId: ctx.employeeId,
    employeeName: ctx.employeeName,
    employeePhotoUrl: ctx.employeePhotoUrl,
  };
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
  });
}
