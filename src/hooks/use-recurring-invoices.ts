"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import { generateInvoiceFromProfile } from "@/lib/generate-recurring-invoice";
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

export function useSaveRecurringInvoiceProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveRecurringProfileInput) => {
      const supabase = createClient();
      const isNew = !input.id;
      const { data, error } = await supabase
        .from("recurring_invoice_profiles")
        .upsert({
          id: input.id,
          name: input.name,
          customer_mobile: input.customerMobile,
          customer_name: input.customerName,
          items: input.items as never,
          subject: input.subject,
          shipping_charges: input.shippingCharges,
          discount_type: input.discountType,
          discount_value: input.discountValue,
          gst_type: input.gstType,
          tax_rate: input.taxRate,
          terms: input.terms,
          notes: input.notes,
          frequency: input.frequency,
          next_run_date: input.nextRunDate,
          end_type: input.endType,
          end_date: input.endDate,
          end_after_count: input.endAfterCount,
          created_by: input.userEmail || null,
        })
        .select()
        .single();
      if (error) throw error;
      await logAction(supabase, input.userEmail, isNew ? `Recurring invoice profile created: ${input.name}` : `Recurring invoice profile updated: ${input.name}`);
      return data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteRecurringInvoiceProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, userEmail }: { id: string; name: string; userEmail?: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("recurring_invoice_profiles").delete().eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `Recurring invoice profile deleted: ${name}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetRecurringInvoiceProfileActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const supabase = createClient();
      const { error } = await supabase.from("recurring_invoice_profiles").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Manual "Generate now" trigger — the logged-in user's own session/RLS, no service role needed. */
export function useGenerateRecurringInvoiceNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profile, userEmail }: { profile: RecurringInvoiceProfile; userEmail?: string }) => {
      const supabase = createClient();
      const result = await generateInvoiceFromProfile(supabase, profile, userEmail);
      await logAction(supabase, userEmail, `Recurring invoice generated: ${result.invoiceNumber} (from profile ${profile.name})`);
      return result;
    },
    onSuccess: () => invalidateAll(qc),
  });
}
