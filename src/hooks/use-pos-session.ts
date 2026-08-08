"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPosSessionRow } from "@/lib/types";

async function fetchOpenSession() {
  const supabase = createClient();
  const { data, error } = await supabase.from("pos_sessions").select("*").eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? mapPosSessionRow(data) : null;
}

/** The currently open register session, if any — the POS screen won't accept sales without one. */
export function useOpenPosSession() {
  return useQuery({
    queryKey: ["pos-session", "open"],
    queryFn: fetchOpenSession,
    staleTime: 10_000,
  });
}

export function useOpenRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ openingCash, userEmail }: { openingCash: number; userEmail?: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pos_sessions")
        .insert({ opening_cash: openingCash, opened_by: userEmail || null, status: "open" })
        .select()
        .single();
      if (error) throw error;
      return mapPosSessionRow(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-session"] }),
  });
}

/** Cash sales recorded against a session, for the closing-cash reconciliation. */
async function fetchSessionCashTotal(sessionId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("sales_payments").select("amount").eq("pos_session_id", sessionId).eq("method", "Cash");
  if (error) throw error;
  return (data || []).reduce((s, r) => s + (r.amount || 0), 0);
}

export function useSessionCashTotal(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["pos-session", "cash-total", sessionId],
    queryFn: () => fetchSessionCashTotal(sessionId!),
    enabled: !!sessionId,
  });
}

export function useCloseRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, closingCash, expectedCash }: { sessionId: string; closingCash: number; expectedCash: number }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("pos_sessions")
        .update({ status: "closed", closed_at: new Date().toISOString(), closing_cash: closingCash, expected_cash: expectedCash })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-session"] }),
  });
}
