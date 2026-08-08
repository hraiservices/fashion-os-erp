"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Permissions } from "@/lib/permissions";

export interface UserRoleRow {
  email: string;
  role: string;
  phone: string | null;
  custom_permissions: Partial<Permissions> | null;
}

async function fetchUserRoles(): Promise<UserRoleRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("user_roles").select("*").order("email");
  if (error) throw error;
  return (data || []).map((r) => ({ email: r.email, role: r.role, phone: r.phone, custom_permissions: r.custom_permissions as Partial<Permissions> | null }));
}

export function useUserRoles() {
  return useQuery({
    queryKey: ["user-roles"],
    queryFn: fetchUserRoles,
    staleTime: 30_000,
  });
}

/** setUserRole(), used by assignRole()/updateRole(), line ~13418. Upsert by email. */
export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role, custom }: { email: string; role: string; custom?: Partial<Permissions> }) => {
      const supabase = createClient();
      const { error } = await supabase.from("user_roles").upsert({ email: email.trim().toLowerCase(), role, custom_permissions: custom || {} });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-roles"] }),
  });
}

/** renameUserEmail(), line ~13446. */
export function useRenameUserEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ oldEmail, newEmail, role, phone, custom }: { oldEmail: string; newEmail: string; role: string; phone: string | null; custom: Partial<Permissions> | null }) => {
      const supabase = createClient();
      const { error: insertError } = await supabase.from("user_roles").insert({ email: newEmail, role, phone, custom_permissions: custom || {} });
      if (insertError) throw insertError;
      const { error: deleteError } = await supabase.from("user_roles").delete().eq("email", oldEmail);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-roles"] }),
  });
}

/** setUserPhone(), line ~13467. */
export function useSetUserPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, phone }: { email: string; phone: string | null }) => {
      const supabase = createClient();
      const { error } = await supabase.from("user_roles").update({ phone }).eq("email", email);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-roles"] }),
  });
}
