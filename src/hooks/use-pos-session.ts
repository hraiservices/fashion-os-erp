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

/**
 * Opens the register through POST /api/pos/session — `opened_by` is taken from the session
 * cookie there, not from this call, so the register can't be opened in someone else's name.
 * `userEmail` is still accepted for callers' convenience but is no longer sent.
 */
export function useOpenRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ openingCash }: { openingCash: number; userEmail?: string }) => {
      const res = await fetch("/api/pos/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", openingCash }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not open the register");
      return mapPosSessionRow(data.session);
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

/**
 * Closes the register through POST /api/pos/session.
 *
 * `expectedCash` is deliberately NOT sent any more: the server recomputes it from the session's
 * opening float plus the Cash payments actually recorded against it. It is the figure the whole
 * drawer reconciliation is measured against, so accepting the browser's version of it let a
 * short drawer be closed with a zero variance. The parameter is kept in the signature so the
 * POS screen (which shows a live expected figure) doesn't need reshaping; it is simply ignored.
 */
export function useCloseRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, closingCash }: { sessionId: string; closingCash: number; expectedCash?: number }) => {
      const res = await fetch("/api/pos/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", sessionId, closingCash }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not close the register");
      return data as { expectedCash: number; variance: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-session"] }),
  });
}
