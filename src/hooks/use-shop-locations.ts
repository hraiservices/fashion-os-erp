"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import { mapShopLocationRow } from "@/lib/types";

async function fetchShopLocations() {
  const supabase = createClient();
  const { data, error } = await supabase.from("shop_locations").select("*").order("name");
  if (error) throw error;
  return (data || []).map(mapShopLocationRow);
}

export function useShopLocations() {
  return useQuery({
    queryKey: ["shop-locations"],
    queryFn: fetchShopLocations,
    staleTime: 30_000,
  });
}

/** Active locations only, for the employee-form location picker and the check-in geofence lookup. */
export function useActiveShopLocations() {
  const { data, ...rest } = useShopLocations();
  return { data: (data || []).filter((l) => l.active), ...rest };
}

interface SaveShopLocationInput {
  id?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  active: boolean;
  userEmail?: string;
}

export function useSaveShopLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveShopLocationInput) => {
      const supabase = createClient();
      const isNew = !input.id;
      const { data, error } = await supabase
        .from("shop_locations")
        .upsert({
          id: input.id,
          name: input.name.trim(),
          address: input.address.trim(),
          latitude: input.latitude,
          longitude: input.longitude,
          geofence_radius_m: input.geofenceRadiusM,
          active: input.active,
        })
        .select()
        .single();
      if (error) throw error;
      await logAction(supabase, input.userEmail, isNew ? `Shop location added: ${input.name}` : `Shop location updated: ${input.name}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop-locations"] }),
  });
}

export function useDeleteShopLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, userEmail }: { id: string; name: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("shop_locations").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Shop location deleted: ${name}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop-locations"] }),
  });
}
