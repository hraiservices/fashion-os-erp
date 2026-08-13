"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { logAction } from "@/lib/logging";
import { deriveBalance } from "@/lib/business-rules";
import type { Order } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

interface CreateOrderInput {
  name: string;
  mobile: string;
  inDate: string;
  deliveryDate: string;
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
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

/** Plain edits (no loyalty side effects) — mirrors the editOrder branch of _handleSave(), line ~16970. */
export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, userEmail }: { id: string; patch: Partial<Order>; userEmail?: string }) => {
      const supabase = createClient();

      // Fetch current row so we can compute balance accurately even when only total OR
      // advance is in the patch (not both). Without this, defaulting advance to 0 would
      // write balance = total, wiping all previously-recorded payments.
      const { data: currentRow } = await supabase.from("orders").select("total,advance,balance").eq("id", id).single();
      const currentTotal   = currentRow?.total   ?? 0;
      const currentAdvance = currentRow?.advance ?? 0;

      const dbPatch: OrderUpdate = {};
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.mobile !== undefined) dbPatch.mobile = patch.mobile;
      if (patch.inDate !== undefined) dbPatch.in_date = patch.inDate;
      if (patch.deliveryDate !== undefined) dbPatch.delivery_date = patch.deliveryDate;
      if (patch.garments !== undefined) dbPatch.garments = patch.garments;
      if (patch.total !== undefined) dbPatch.total = patch.total;
      if (patch.advance !== undefined) dbPatch.advance = patch.advance;
      // Recompute balance using the resolved total/advance (falling back to current DB values)
      if (patch.total !== undefined || patch.advance !== undefined) {
        const newTotal   = dbPatch.total   ?? currentTotal;
        const newAdvance = dbPatch.advance ?? currentAdvance;
        if (newTotal < newAdvance) {
          throw new Error(`Total (₹${newTotal}) cannot be less than advance already collected (₹${newAdvance}). Record a refund or reduce the advance first.`);
        }
        dbPatch.balance = deriveBalance(newTotal, newAdvance);
      }
      if (patch.tailor !== undefined) dbPatch.tailor = patch.tailor;
      if (patch.orderType !== undefined) dbPatch.order_type = patch.orderType;
      if (patch.special !== undefined) dbPatch.special = patch.special;
      if (patch.measurements !== undefined) dbPatch.measurements = patch.measurements;
      // Attachments are stored as base64 data URLs in JSONB columns; omitting them here
      // would silently drop every photo/voice note the edit form shows as attached.
      if (patch.images !== undefined) dbPatch.images = patch.images;
      if (patch.audios !== undefined) dbPatch.audios = patch.audios;
      if (patch.videos !== undefined) dbPatch.videos = patch.videos;
      // Append a history entry for financial changes so the in-order audit trail reflects
      // who changed the price and when — not just the activity log.
      const financialChanged = patch.total !== undefined || patch.advance !== undefined;
      if (financialChanged) {
        const newTotal   = dbPatch.total   ?? currentTotal;
        const newAdvance = dbPatch.advance ?? currentAdvance;
        const userName = userEmail?.split("@")[0] || "user";
        const now = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
        const historyLine = `✏️ Edited — Total ₹${currentTotal}→₹${newTotal}, Advance ₹${currentAdvance}→₹${newAdvance} by ${userName} — ${now}`;
        const { data: orderNow } = await supabase.from("orders").select("history").eq("id", id).single();
        const history: string[] = Array.isArray(orderNow?.history) ? (orderNow.history as string[]) : [];
        dbPatch.history = [...history, historyLine] as never;
      }

      const { error } = await supabase.from("orders").update(dbPatch).eq("id", id);
      if (error) throw error;
      await logAction(supabase, userEmail, `✏️ Order edited: ${patch.name || ""}`, id);
    },
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
