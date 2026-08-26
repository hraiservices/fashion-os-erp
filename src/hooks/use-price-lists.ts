"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPriceListRow, mapPriceListItemRow, type PriceList, type PriceListItem } from "@/lib/types";

export function usePriceLists() {
  return useQuery({
    queryKey: ["price-lists"],
    queryFn: async (): Promise<PriceList[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("price_lists").select("*").order("name");
      if (error) throw error;
      return (data || []).map(mapPriceListRow);
    },
    staleTime: 30_000,
  });
}

export function usePriceListItems(priceListId: string) {
  return useQuery({
    queryKey: ["price-list-items", priceListId],
    queryFn: async (): Promise<PriceListItem[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("price_list_items").select("*").eq("price_list_id", priceListId);
      if (error) throw error;
      return (data || []).map(mapPriceListItemRow);
    },
    enabled: !!priceListId,
    staleTime: 30_000,
  });
}

/** Map of productId -> override price, for the invoice/quotation line editor to consult when a customer has a price list assigned. */
export function usePriceListItemsMap(priceListId: string | null | undefined) {
  const { data } = usePriceListItems(priceListId || "");
  const map = new Map<string, number>();
  (data || []).forEach((item) => map.set(item.productId, item.price));
  return map;
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
export function useSavePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, notes }: { id?: string; name: string; notes: string; userEmail?: string }) =>
      (await apiPost<{ id: string }>("/api/price-lists", { id, name, notes })).id,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-lists"] }),
  });
}

export function useDeletePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/price-lists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-lists"] }),
  });
}

export function useSavePriceListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ priceListId, productId, price }: { priceListId: string; productId: string; price: number }) =>
      apiPost<{ ok: true }>("/api/price-lists/items", { priceListId, productId, price }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["price-list-items", vars.priceListId] }),
  });
}

export function useDeletePriceListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, priceListId }: { id: string; priceListId: string }) => {
      await apiDelete<{ ok: true }>(`/api/price-lists/items/${id}`);
      return priceListId;
    },
    onSuccess: (priceListId) => qc.invalidateQueries({ queryKey: ["price-list-items", priceListId] }),
  });
}
