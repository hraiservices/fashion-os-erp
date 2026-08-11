"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_ENTITLEMENTS, type ModuleEntitlements } from "@/lib/entitlements";

/** Read-only — plain app_settings read, same as every other setting. */
export function useModuleEntitlements() {
  return useAppSetting<ModuleEntitlements>("moduleEntitlements", DEFAULT_ENTITLEMENTS);
}

/**
 * Writes go through the `set_module_entitlements` RPC (supabase/migrations/add_module_entitlements.sql),
 * not a direct app_settings upsert — the RPC rejects the write server-side unless the caller's
 * login email matches the platform owner, so a shop's own admin can't re-enable a module they
 * weren't sold via dev tools.
 */
export function useSaveModuleEntitlements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: ModuleEntitlements) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("set_module_entitlements", { p_value: value as never });
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      qc.setQueryData(["app-setting", "moduleEntitlements"], value);
    },
  });
}
