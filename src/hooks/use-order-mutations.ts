"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Order } from "@/lib/types";

interface CreateOrderInput {
  name: string;
  mobile: string;
  inDate: string;
  deliveryDate: string;
  inTime?: string;
  deliveryTime?: string;
  garments: { type: string; lining?: string; no?: number; amount?: number }[];
  total: number;
  advance: number;
  tailor: string;
  special: string;
  measurements: Record<string, unknown>;
  images?: string[];
  audios?: string[];
  videos?: string[];
  usePoints?: boolean;
  orderType?: "new" | "alteration";
  paymentMethod?: string;
  bookingSource?: string;
  fabricCost?: number;
  otherCost?: number;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => postJson<{ order: Order; ptDiscount: number; limitWarning?: string }>("/api/orders", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-by-mobile"] });
    },
  });
}

export function useAdvanceStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => postJson<{ order: Order }>(`/api/orders/${orderId}/advance-stage`, {}),
    onSuccess: (_data, orderId) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    },
  });
}

/** Kanban drag-and-drop: move an order to any stage, not just the next one. */
export function useSetStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, stage }: { orderId: string; stage: string }) =>
      postJson<{ order: Order }>(`/api/orders/${orderId}/set-stage`, { stage }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", vars.orderId] });
    },
  });
}

/** Toggles the rework flag — tag only, never moves the order's stage. */
export function useSetOrderRework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, flag, reason }: { orderId: string; flag: boolean; reason?: string }) =>
      postJson<{ order: Order }>(`/api/orders/${orderId}/rework`, { flag, reason }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", vars.orderId] });
    },
  });
}

interface PaymentInput {
  orderId: string;
  amount: number;
  payMethod: string;
  note?: string;
  usePoints?: boolean;
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...body }: PaymentInput) => postJson<{ order: Order }>(`/api/orders/${orderId}/payment`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", vars.orderId] });
      // Loyalty points may have been redeemed or earned — invalidate customer cache so
      // the next payment modal shows the correct available points.
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-by-mobile"] });
    },
  });
}

/**
 * Order edit — delegates to PATCH /api/orders/[id] (server route) so:
 *   • editOrder permission is enforced server-side (C4 — was bypassed before)
 *   • all fields updated atomically via edit_order() SQL RPC (C5 — history TOCTOU fix)
 *   • userEmail and timestamp come from the server session (H3, M8)
 *   • advance > total validated server-side (B5)
 * The userEmail parameter is accepted for call-site compatibility but ignored here —
 * the server resolves the authenticated user from the session cookie.
 */
/** Patch payload — order fields plus the optimistic-concurrency baseline for `advance`. */
type OrderEditPatch = Partial<Order> & { expectedAdvance?: number };

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: OrderEditPatch; userEmail?: string }) =>
      patchJson<{ order: Order }>(`/api/orders/${id}`, patch),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", vars.id] });
    },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; name: string; userEmail?: string }) => {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
