"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/** Previously ran entirely client-side with no permission check — see the API route's comment. */
export function useSaveShopLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveShopLocationInput) => (await apiPost<{ location: { id: string } }>("/api/employees/shop-locations", input)).location,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop-locations"] }),
  });
}

export function useDeleteShopLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string; userEmail?: string }) => apiDelete<{ ok: true }>(`/api/employees/shop-locations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop-locations"] }),
  });
}
