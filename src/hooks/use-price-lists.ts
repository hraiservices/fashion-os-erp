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

export function useSavePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, notes, userEmail }: { id?: string; name: string; notes: string; userEmail?: string }) => {
      const supabase = createClient();
      if (id) {
        const { error } = await supabase.from("price_lists").update({ name, notes }).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("price_lists").insert({ name, notes, created_by: userEmail || null }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-lists"] }),
  });
}

export function useDeletePriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("price_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-lists"] }),
  });
}

export function useSavePriceListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ priceListId, productId, price }: { priceListId: string; productId: string; price: number }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("price_list_items")
        .upsert({ price_list_id: priceListId, product_id: productId, price }, { onConflict: "price_list_id,product_id" });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["price-list-items", vars.priceListId] }),
  });
}

export function useDeletePriceListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, priceListId }: { id: string; priceListId: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("price_list_items").delete().eq("id", id);
      if (error) throw error;
      return priceListId;
    },
    onSuccess: (priceListId) => qc.invalidateQueries({ queryKey: ["price-list-items", priceListId] }),
  });
}
