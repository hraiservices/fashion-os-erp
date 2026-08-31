"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Json } from "@/lib/supabase/database.types";

interface SaveCustomerInput {
  name: string;
  mobile: string;
  /**
   * The mobile the customer had when the form opened. Customer identity is keyed as
   * 'CUST-' || mobile, so a changed number re-keys the row — the server uses this to
   * migrate loyalty balance, history and existing orders instead of orphaning them.
   */
  originalMobile?: string;
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
  whatsappOptOut?: boolean;
  userEmail?: string;
}

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/**
 * Save a customer profile. Routed through POST /api/customers so manageCustomers is
 * enforced server-side (this used to write straight to Supabase, making the permission
 * UI-only) and so a changed mobile number migrates rather than orphans the record.
 * Loyalty fields are never sent — only the loyalty RPCs may move points.
 */
export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    // userEmail is ignored: the server derives the actor from the session cookie.
    mutationFn: ({ userEmail: _ignored, ...input }: SaveCustomerInput) =>
      sendJson<{ ok: true }>("/api/customers", "POST", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-by-mobile"] });
    },
  });
}

/**
 * Delete a customer and their order history.
 *
 * This previously ran as two unguarded client-side deletes — `orders` by mobile, then the
 * customer row — with no server-side authorization whatsoever. Any authenticated user
 * could erase every order for a customer, including delivered and fully-paid ones, which
 * also sidestepped the paid/delivered guard on the per-order delete route. It now goes
 * through DELETE /api/customers/[mobile], which enforces deleteCustomers and refuses when
 * settled orders or an outstanding balance exist.
 */
export function useDeleteCustomerAndOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mobile }: { mobile: string; name: string; custId?: string; userEmail?: string }) =>
      sendJson<{ ok: true; deletedOrders: number }>(`/api/customers/${encodeURIComponent(mobile)}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-by-mobile"] });
    },
  });
}

/**
 * Manual loyalty grant. Routed through the server so manageCustomers is enforced and the
 * amount is bounded — the browser previously called the award RPC directly with no
 * permission check and no cap, so any authenticated user could mint unlimited points
 * and convert them straight into discounts.
 */
export function useGiveLoyaltyBonus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mobile, name, pts }: { mobile: string; name: string; pts: number }) =>
      sendJson<{ ok: true }>(`/api/customers/${encodeURIComponent(mobile)}/loyalty-bonus`, "POST", { name, pts }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-by-mobile"] });
    },
  });
}
