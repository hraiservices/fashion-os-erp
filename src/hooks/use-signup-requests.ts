"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SignupRequestRow {
  id: string;
  name: string;
  shop_name: string;
  email: string;
  phone: string | null;
  note: string | null;
  status: string;
  created_at: string;
}

async function fetchSignupRequests(): Promise<SignupRequestRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("signup_requests").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** RLS restricts both SELECT and UPDATE to manageUsers holders — this just mirrors that. */
export function useSignupRequests(enabled = true) {
  return useQuery({
    queryKey: ["signup-requests"],
    queryFn: fetchSignupRequests,
    staleTime: 30_000,
    enabled,
  });
}

export function useSetSignupRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("signup_requests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signup-requests"] }),
  });
}
