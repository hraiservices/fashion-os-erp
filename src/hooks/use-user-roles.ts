"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Permissions } from "@/lib/permissions";

export interface UserRoleRow {
  email: string;
  role: string;
  phone: string | null;
  custom_permissions: Partial<Permissions> | null;
  linked_employee_id: string | null;
}

async function fetchUserRoles(): Promise<UserRoleRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("user_roles").select("*").order("email");
  if (error) throw error;
  return (data || []).map((r) => ({
    email: r.email,
    role: r.role,
    phone: r.phone,
    custom_permissions: r.custom_permissions as Partial<Permissions> | null,
    linked_employee_id: r.linked_employee_id,
  }));
}

/** `enabled` defaults to true (the Users & Roles page's own use) — pass false for call sites
 *  that only want this for non-admins-shouldn't-trigger-it reasons (e.g. the Employees list's
 *  "linked account" badge, only relevant/shown to manageUsers holders in the first place). The
 *  underlying table's RLS is permissive by design (like most tables in this app — writes are
 *  enforced by the /api/user-roles/* routes instead), so this `enabled` flag is about not
 *  casually surfacing every user's email/role/permissions through an unrelated page's data
 *  fetch, not a security boundary in itself. */
export function useUserRoles(enabled = true) {
  return useQuery({
    queryKey: ["user-roles"],
    queryFn: fetchUserRoles,
    staleTime: 30_000,
    enabled,
  });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/** setUserRole(), used by assignRole()/updateRole(). Routed through POST /api/user-roles so
 *  manageUsers is enforced server-side — this used to write straight to user_roles from the
 *  browser, meaning ANY authenticated user could set their own role to admin (see the API
 *  route's comment for the full explanation). */
export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role, custom }: { email: string; role: string; custom?: Partial<Permissions> }) =>
      postJson<{ ok: true }>("/api/user-roles", { email: email.trim().toLowerCase(), role, custom: custom || {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-roles"] }),
  });
}

/** renameUserEmail(). Routed through POST /api/user-roles/rename — same manageUsers gate. */
export function useRenameUserEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ oldEmail, newEmail, role, phone, custom }: { oldEmail: string; newEmail: string; role: string; phone: string | null; custom: Partial<Permissions> | null }) =>
      postJson<{ ok: true }>("/api/user-roles/rename", { oldEmail, newEmail, role, phone, custom }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-roles"] }),
  });
}

/** setUserPhone(). Routed through POST /api/user-roles/phone — same manageUsers gate. */
export function useSetUserPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, phone }: { email: string; phone: string | null }) =>
      postJson<{ ok: true }>("/api/user-roles/phone", { email, phone }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-roles"] }),
  });
}

/** Links (or unlinks, with employeeId: null) a login to an employee record — the single
 *  source-of-truth mutation called from both the Users & Roles picker and the Employee form's
 *  picker. Routed through POST /api/user-roles/link — same manageUsers gate. Invalidates
 *  employees too since that list's "linked" badge depends on this data. */
export function useLinkEmployeeToUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, employeeId }: { email: string; employeeId: string | null }) =>
      postJson<{ ok: true }>("/api/user-roles/link", { email, employeeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-roles"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}
