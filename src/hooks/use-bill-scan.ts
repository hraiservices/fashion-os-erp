"use client";

import { useMutation } from "@tanstack/react-query";
import type { GstType } from "@/lib/gst";

export interface BillScanItemDraft {
  description: string;
  qty: number;
  unitCost: number;
  itemType: "raw_material" | "product" | null;
  itemId: string | null;
  itemName: string | null;
  unitName: string;
}

export interface BillScanDraft {
  vendorId: string | null;
  vendorName: string;
  billDate: string;
  dueDate: string | null;
  referenceNumber: string;
  items: BillScanItemDraft[];
  gstType: GstType;
  taxRate: number;
  shippingCharges: number;
  otherCharges: number;
  notes: string;
}

interface BillScanResult {
  scanPath: string;
  scanContentType: string;
  draft: BillScanDraft;
}

interface BillScanInput {
  base64: string;
  contentType: string;
  fileName: string;
}

/** Uploads a bill photo/PDF and asks AI to read it into a draft for BillForm to prefill — see
 *  /api/purchases/bills/scan. The draft is never saved on its own; staff still review/edit and
 *  hit Record Bill like any manually-entered bill. */
export function useScanBill() {
  return useMutation({
    mutationFn: async (input: BillScanInput): Promise<BillScanResult> => {
      const res = await fetch("/api/purchases/bills/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read that bill");
      return data;
    },
  });
}

/** Signed link to view the original scan a bill was created from — see
 *  /api/purchases/bills/[id]/scan-url. */
export function useBillScanUrl() {
  return useMutation({
    mutationFn: async (billId: string): Promise<string> => {
      const res = await fetch(`/api/purchases/bills/${billId}/scan-url`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't open the original scan");
      return data.url as string;
    },
  });
}
