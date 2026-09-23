"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface EmployeeDocumentListItem {
  id: string;
  category: "payslip" | "other";
  label: string;
  createdAt: string;
  url: string | null;
}

export interface EmployeeDocuments {
  aadhaarNumber: string | null;
  aadhaarImageUrl: string | null;
  panNumber: string | null;
  panImageUrl: string | null;
  offerLetterUrl: string | null;
  relievingLetterUrl: string | null;
  resignationLetterUrl: string | null;
  experienceLetterUrl: string | null;
  payslips: EmployeeDocumentListItem[];
  otherDocuments: EmployeeDocumentListItem[];
}

/** Admin-only KYC/documents for one employee — GET /api/employees/[id]/documents. Not enabled
 *  by default; the manager component only mounts (and this only fetches) once an admin actually
 *  opens the section, so nobody else's browser ever requests this data. */
export function useEmployeeDocuments(employeeId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: async (): Promise<EmployeeDocuments> => {
      const res = await fetch(`/api/employees/${employeeId}/documents`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load documents");
      return data;
    },
    enabled: enabled && !!employeeId,
  });
}

async function postJson(url: string, body: unknown): Promise<{ ok: true }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/** Sets Aadhaar/PAN numbers and/or their images in one call — POST .../documents {action:"kyc"}. */
export function useSaveEmployeeKyc(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { aadhaarNumber?: string; panNumber?: string; aadhaarImage?: string; panImage?: string }) =>
      postJson(`/api/employees/${employeeId}/documents`, { action: "kyc", ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-documents", employeeId] }),
  });
}

export type DocumentSlot = "offer" | "relieving" | "resignation" | "experience";

/** Replaces one of the four single-file letter slots — POST .../documents {action:"single"}. */
export function useUploadEmployeeDocumentSlot(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slot, file }: { slot: DocumentSlot; file: string }) => postJson(`/api/employees/${employeeId}/documents`, { action: "single", slot, file }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-documents", employeeId] }),
  });
}

/** Adds one entry to the payslip-copies or other-documents list — POST .../documents/list. */
export function useAddEmployeeDocumentListItem(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ category, label, file }: { category: "payslip" | "other"; label: string; file: string }) =>
      postJson(`/api/employees/${employeeId}/documents/list`, { category, label, file }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-documents", employeeId] }),
  });
}

/** Removes one entry from either list — DELETE .../documents/list?docId=... */
export function useDeleteEmployeeDocumentListItem(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`/api/employees/${employeeId}/documents/list?docId=${encodeURIComponent(docId)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-documents", employeeId] }),
  });
}
