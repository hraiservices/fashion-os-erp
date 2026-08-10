"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { isRestrictedRole, resolvePerms, type Permissions } from "@/lib/permissions";

export interface CurrentUser {
  email: string;
  role: string;
  perms: Permissions;
  restricted: boolean;
  /** Platform owner, identified by a fixed env-var email — governs module licensing, not per-shop roles/permissions. */
  isSuperAdmin: boolean;
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

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, custom_permissions")
    .eq("email", user.email)
    .maybeSingle();

  const role = roleRow?.role || "tailor";
  const perms = resolvePerms(role, roleRow?.custom_permissions as Partial<Permissions> | null);

  return { email: user.email, role, perms, restricted: isRestrictedRole(role), isSuperAdmin: checkSuperAdmin(user.email) };
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
  });
}
