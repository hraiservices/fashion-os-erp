"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapRecurringInvoiceProfileRow, type RecurringInvoiceProfile, type RecurringFrequency, type RecurringEndType } from "@/lib/types";
import type { SalesLineItem } from "@/lib/sales";
import type { GstType } from "@/lib/gst";
import type { DiscountType } from "@/lib/invoice-totals";

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["recurring-invoice-profiles"] });
  qc.invalidateQueries({ queryKey: ["recurring-invoice-profile"] });
  qc.invalidateQueries({ queryKey: ["sales-invoices"] });
  qc.invalidateQueries({ queryKey: ["products"] });
  qc.invalidateQueries({ queryKey: ["inventory-ledger"] });
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

export function useRecurringInvoiceProfiles() {
  return useQuery({
    queryKey: ["recurring-invoice-profiles"],
    queryFn: async (): Promise<RecurringInvoiceProfile[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("recurring_invoice_profiles").select("*").order("name");
      if (error) throw error;
      return (data || []).map(mapRecurringInvoiceProfileRow);
    },
    staleTime: 15_000,
  });
}

export function useRecurringInvoiceProfile(id: string) {
  return useQuery({
    queryKey: ["recurring-invoice-profile", id],
    queryFn: async (): Promise<RecurringInvoiceProfile | null> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("recurring_invoice_profiles").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapRecurringInvoiceProfileRow(data) : null;
    },
    enabled: !!id,
  });
}

interface SaveRecurringProfileInput {
  id?: string;
  name: string;
  customerMobile: string;
  customerName: string;
  items: SalesLineItem[];
  subject: string;
  shippingCharges: number;
  discountType: DiscountType;
  discountValue: number;
  gstType: GstType;
  taxRate: number;
  terms: string;
  notes: string;
  frequency: RecurringFrequency;
  nextRunDate: string;
  endType: RecurringEndType;
  endDate: string | null;
  endAfterCount: number | null;
  userEmail?: string;
}

/** Previously ran entirely client-side with no permission check — see the API route's comment. */
export function useSaveRecurringInvoiceProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveRecurringProfileInput) => (await apiPost<{ profile: unknown }>("/api/sales/recurring-invoices", input)).profile,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteRecurringInvoiceProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string; userEmail?: string }) => apiDelete<{ ok: true }>(`/api/sales/recurring-invoices/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetRecurringInvoiceProfileActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => apiPost<{ ok: true }>(`/api/sales/recurring-invoices/${id}/active`, { active }),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Manual "Generate now" trigger — server re-fetches the current profile row itself rather
 *  than trusting whatever the browser already had in memory; see the route's comment. */
export function useGenerateRecurringInvoiceNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ profile }: { profile: RecurringInvoiceProfile; userEmail?: string }) =>
      apiPost<{ invoiceId: string; invoiceNumber: string }>(`/api/sales/recurring-invoices/${profile.id}/generate-now`, {}),
    onSuccess: () => invalidateAll(qc),
  });
}
