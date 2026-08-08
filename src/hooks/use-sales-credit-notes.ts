"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapSalesCreditNoteRow } from "@/lib/types";

async function fetchAllCreditNotes() {
  const supabase = createClient();
  const { data, error } = await supabase.from("sales_credit_notes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSalesCreditNoteRow);
}

export function useSalesCreditNotes() {
  return useQuery({
    queryKey: ["sales-credit-notes"],
    queryFn: fetchAllCreditNotes,
    staleTime: 15_000,
  });
}

async function fetchCreditNotesForInvoice(invoiceId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("sales_credit_notes").select("*").eq("invoice_id", invoiceId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSalesCreditNoteRow);
}

export function useSalesCreditNotesForInvoice(invoiceId: string) {
  return useQuery({
    queryKey: ["sales-credit-notes", "invoice", invoiceId],
    queryFn: () => fetchCreditNotesForInvoice(invoiceId),
    enabled: !!invoiceId,
  });
}
