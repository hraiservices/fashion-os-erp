"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

/** syncSettings(key, value), Stitching_Manager_Pro_v16.html ~line 16466 — upserts app_settings. */
export function useAppSetting<T>(key: string, fallback: T) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["app-setting", key],
    queryFn: async (): Promise<T> => {
      const supabase = createClient();
      const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
      if (data?.value == null) return fallback;

      // Array-valued settings (tailors, measureFields) must be returned as-is. Spreading
      // them into an object literal — as the object-merge path below does — turns
      // ["a","b"] into {0:"a",1:"b"}, which then blows up on .map() at the call site.
      if (Array.isArray(fallback) || Array.isArray(data.value)) {
        return (Array.isArray(data.value) ? data.value : fallback) as T;
      }

      // Objects merge over the defaults so a config saved before a new field existed
      // still picks up that field's default (e.g. loyalty gaining a new threshold).
      if (typeof data.value === "object" && typeof fallback === "object" && fallback !== null) {
        return { ...fallback, ...(data.value as object) } as T;
      }

      return data.value as T;
    },
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async (value: T) => {
      const supabase = createClient();
      const { error } = await supabase.from("app_settings").upsert({ key, value: value as Json });
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      qc.setQueryData(["app-setting", key], value);
    },
  });

  return { ...query, save };
}
