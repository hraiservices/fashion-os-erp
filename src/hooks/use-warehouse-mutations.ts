"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";

interface SaveWarehouseInput {
  id?: string;
  name: string;
  address: string;
  isDefault: boolean;
  active: boolean;
  userEmail?: string;
}

export function useSaveWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveWarehouseInput) => {
      const supabase = createClient();
      const isNew = !input.id;
      if (input.isDefault) {
        await supabase.from("warehouses").update({ is_default: false }).neq("id", input.id || "");
      }
      const { data, error } = await supabase
        .from("warehouses")
        .upsert({
          id: input.id,
          name: input.name.trim(),
          address: input.address.trim(),
          is_default: input.isDefault,
          active: input.active,
        })
        .select()
        .single();
      if (error) throw error;
      await logAction(supabase, input.userEmail, isNew ? `Warehouse added: ${input.name}` : `Warehouse updated: ${input.name}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["warehouse"] });
    },
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, userEmail }: { id: string; name: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("warehouses").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Warehouse deleted: ${name}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
  });
}
