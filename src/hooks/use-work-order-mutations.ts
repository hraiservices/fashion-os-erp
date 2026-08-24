"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkOrderMaterial, WoStatus } from "@/lib/manufacturing";

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["work-orders"] });
  qc.invalidateQueries({ queryKey: ["work-order"] });
  qc.invalidateQueries({ queryKey: ["raw-materials"] });
  qc.invalidateQueries({ queryKey: ["products"] });
  qc.invalidateQueries({ queryKey: ["inventory-ledger"] });
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

interface CreateWorkOrderInput {
  woNumber: string;
  productId: string;
  productName: string;
  qtyToProduce: number;
  tailor: string;
  startDate: string;
  dueDate?: string | null;
  materials: WorkOrderMaterial[];
  laborCostPerPiece: number;
  notes: string;
}

/** Routed through POST /api/work-orders so manageManufacturing is enforced server-side —
 *  this used to write straight to Supabase under a permissive RLS policy, making the
 *  permission UI-only. */
export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkOrderInput) => sendJson<{ id: string }>("/api/work-orders", "POST", input),
    onSuccess: () => invalidateAll(qc),
  });
}

interface UpdateWorkOrderInput {
  id: string;
  woNumber: string;
  productId: string;
  productName: string;
  qtyToProduce: number;
  tailor: string;
  startDate: string;
  dueDate?: string | null;
  materials: WorkOrderMaterial[];
  laborCostPerPiece: number;
  notes: string;
}

/** Editing is only offered in the UI while status !== "completed" — also enforced server-side now. */
export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateWorkOrderInput) => sendJson<{ ok: true }>(`/api/work-orders/${id}`, "PATCH", input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAdvanceWoStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; woNumber: string; status: WoStatus }) =>
      sendJson<{ ok: true }>(`/api/work-orders/${id}/advance-status`, "POST", { status }),
    onSuccess: () => invalidateAll(qc),
  });
}

interface CompleteWorkOrderInput {
  id: string;
  materials: WorkOrderMaterial[];
}

/**
 * Completing a work order is the moment stock actually moves — server-side now (see
 * /api/work-orders/[id]/complete) so the cost fields and inventory ledger writes can't be
 * bypassed, and so manageManufacturing is actually enforced.
 */
export function useCompleteWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, materials }: CompleteWorkOrderInput) =>
      sendJson<{ ok: true; costPerUnit: number }>(`/api/work-orders/${id}/complete`, "POST", { materials }),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Confirms a completed work order's laborCost as a real tailor payable — see the self-dealing
 *  note on /api/work-orders/[id]/confirm-payable. */
export function useConfirmWoPayable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sendJson<{ ok: true; confirmedAt: string }>(`/api/work-orders/${id}/confirm-payable`, "POST"),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; woNumber: string }) => sendJson<{ ok: true }>(`/api/work-orders/${id}`, "DELETE"),
    onSuccess: () => invalidateAll(qc),
  });
}
