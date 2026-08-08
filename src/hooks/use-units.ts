"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapUnitRow } from "@/lib/types";

async function fetchUnits() {
  const supabase = createClient();
  const { data, error } = await supabase.from("units_of_measure").select("*").order("name");
  if (error) throw error;
  return (data || []).map(mapUnitRow);
}

export function useUnits() {
  return useQuery({
    queryKey: ["units"],
    queryFn: fetchUnits,
    staleTime: 60_000,
  });
}

/** Lets a user add a new unit inline, live, from any form — no separate settings screen. */
export function useAddUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const supabase = createClient();
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Unit name is required");
      const { data, error } = await supabase.from("units_of_measure").insert({ name: trimmed }).select().single();
      if (error) throw error;
      return mapUnitRow(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
}
