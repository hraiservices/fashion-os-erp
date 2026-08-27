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

// Explicit column list — deliberately excludes pin_hash/failed_pin_attempts/pin_locked_until.
// Same reasoning as EMPLOYEE_COLUMNS_BASE in use-employees.ts: RLS lets any authenticated staff
// member read this table, so a bcrypt hash of a 4-6 digit PIN must never be in the payload at
// all, not just hidden from the rendered UI. "Is a PIN set?" is fetched on-demand per row
// instead (useUserHasPin), mirroring the employee PIN manager's own GET route.
const USER_ROLE_COLUMNS = "email, role, phone, custom_permissions, linked_employee_id";

async function fetchUserRoles(): Promise<UserRoleRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("user_roles").select(USER_ROLE_COLUMNS).order("email");
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

/** Creates a brand-new phone+PIN dashboard login with no real email — see the API route's
 *  comment for why this needs its own route rather than reusing useSetUserRole(). */
export function useProvisionPhoneUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mobile, pin, role, custom }: { mobile: string; pin: string; role: string; custom?: Partial<Permissions> }) =>
      postJson<{ ok: true; email: string }>("/api/user-roles/provision-phone", { mobile, pin, role, custom: custom || {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-roles"] }),
  });
}

/** Whether an (unlinked) user's dashboard-login PIN is currently set — fetched on demand per
 *  row (e.g. only while that row is expanded), never as part of the main list. */
export function useUserHasPin(email: string, enabled: boolean) {
  return useQuery({
    queryKey: ["user-has-pin", email],
    queryFn: async (): Promise<boolean> => {
      const res = await fetch(`/api/user-roles/pin?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load PIN status");
      return data.hasPin;
    },
    enabled: enabled && !!email,
  });
}

/** Set/change/clear a dashboard login's own PIN — only valid for a row not linked to an
 *  employee (see the API route's comment). */
export function useSetUserPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, pin }: { email: string; pin: string | null }) => postJson<{ ok: true }>("/api/user-roles/pin", { email, pin }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["user-has-pin", vars.email] }),
  });
}
