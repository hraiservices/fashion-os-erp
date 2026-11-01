"use client";

import { useQuery } from "@tanstack/react-query";

export interface LedgerBreakRow {
  orderId: string;
  customerName: string;
  mobile: string;
  inDate: string;
  status: string;
  total: number;
  storedAdvance: number;
  ledgerAdvance: number;
  advanceDrift: number;
  storedBalance: number;
  expectedBalance: number;
  balanceDrift: number;
  overpaid: boolean;
}

export interface LedgerReconciliationResponse {
  checkedOrders: number;
  checkedPayments: number;
  breakCount: number;
  totalAdvanceDrift: number;
  totalBalanceDrift: number;
  breaks: LedgerBreakRow[];
}

/** Server-computed: comparing every order's stored advance against the full order_payments
 *  ledger needs both tables whole, and order_payments is read-locked per-row for the browser. */
export function useLedgerReconciliation() {
  return useQuery({
    queryKey: ["ledger-reconciliation"],
    queryFn: async (): Promise<LedgerReconciliationResponse> => {
      const res = await fetch("/api/reports/ledger-reconciliation");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load reconciliation");
      return data;
    },
    staleTime: 60_000,
  });
}
