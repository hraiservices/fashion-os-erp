"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import { customerIdFromMobile } from "@/lib/business-rules";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import type { Json } from "@/lib/supabase/database.types";

interface SaveCustomerInput {
  name: string;
  mobile: string;
  email?: string;
  dob?: string;
  anniversary?: string;
  address?: string;
  notes: string;
  paymentTerms?: string;
  priceListId?: string | null;
  measurements?: Record<string, Json>;
  tags?: string[];
  gstin?: string;
  userEmail?: string;
}

/** saveCust(), Stitching_Manager_Pro_v16.html ~line 6805. Loyalty fields are never touched here. */
export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, mobile, email, dob, anniversary, address, notes, paymentTerms, priceListId, measurements, tags, gstin, userEmail }: SaveCustomerInput) => {
      const supabase = createClient();
      const { error } = await supabase.from("customers").upsert({
        id: customerIdFromMobile(mobile),
        name,
        mobile,
        email: email || null,
        dob: dob || null,
        anniversary: anniversary || null,
        address: address || null,
        notes,
        payment_terms: paymentTerms || "due_on_receipt",
        price_list_id: priceListId || null,
        gstin: gstin || "",
        ...(measurements ? { measurements: measurements as Json } : {}),
        ...(tags ? { tags } : {}),
      });
      if (error) throw error;
      await logAction(supabase, userEmail, `✏️ Customer profile updated: ${name} (${mobile})`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-by-mobile"] });
    },
  });
}

/**
 * doDeleteCust(), line ~6869. Deletes the customer's ENTIRE order history along with the
 * customer row — a deliberately destructive action, gated by the deleteCustomers permission
 * and (in the UI) a confirmation that surfaces outstanding balance / in-progress orders.
 */
export function useDeleteCustomerAndOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mobile, name, custId, userEmail }: { mobile: string; name: string; custId?: string; userEmail?: string }) => {
      const supabase = createClient();
      await supabase.from("orders").delete().eq("mobile", mobile);
      if (custId) await supabase.from("customers").delete().eq("id", custId);
      await logAction(supabase, userEmail, `🗑️ Deleted: ${name} (${mobile})`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-by-mobile"] });
    },
  });
}

/** Manual bonus grant, line ~7871 — now routed through the same atomic RPC as other awards. */
export function useGiveLoyaltyBonus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mobile, name, pts }: { mobile: string; name: string; pts: number }) => {
      const supabase = createClient();
      await awardLoyaltyPoints(supabase, mobile, name, pts, "manual", null, "Manual bonus");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-by-mobile"] });
    },
  });
}
