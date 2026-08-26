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

/** Lets a user add a new unit inline, live, from any form — no separate settings screen.
 *  Previously ran entirely client-side with no permission check. */
export function useAddUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Unit name is required");
      const res = await fetch("/api/inventory/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return mapUnitRow(data.unit);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
}
