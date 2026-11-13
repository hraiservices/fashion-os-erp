"use client";

import { useMemo } from "react";
import { useOrdersLight } from "@/hooks/use-orders-light";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { getInvoiceOutstanding, getOrderOutstanding } from "@/lib/balances";
import { inr } from "@/lib/format";
import type { SearchSelectOption } from "@/components/ui/search-select";

/**
 * What each customer owes in total, keyed by mobile: outstanding stitching-order balances plus
 * unpaid invoice balances added together. This is deliberately the same arithmetic Record Payment
 * uses for its "Total payable" figure (balances.ts's getOrderOutstanding / getInvoiceOutstanding),
 * so the number beside a name in a customer search and the number on the payment screen can never
 * disagree — a cancelled order owes nothing, an invoice's balance is already net of payments and
 * credit notes.
 *
 * Both source queries are the shared, cached ones (["orders-light"], ["sales-invoices"]) that the
 * dashboard and most list pages already hold, so adding this to a customer search is a cache hit
 * rather than a new fetch.
 */
export function useCustomerBalances(): Map<string, number> {
  const { data: orders } = useOrdersLight();
  const { data: invoices } = useSalesInvoices();

  return useMemo(() => {
    const byMobile = new Map<string, number>();
    const add = (mobile: string | undefined, amount: number) => {
      if (!mobile || amount <= 0) return;
      byMobile.set(mobile, Math.round(((byMobile.get(mobile) || 0) + amount) * 100) / 100);
    };
    for (const o of orders || []) add(o.mobile, getOrderOutstanding(o));
    for (const i of invoices || []) add(i.customerMobile, getInvoiceOutstanding(i));
    return byMobile;
  }, [orders, invoices]);
}

/**
 * The right-hand figure for a customer row in a SearchSelect: the combined balance due in amber
 * when they owe something, a grey ₹0 when they owe nothing. Showing ₹0 rather than leaving the
 * row blank is deliberate — it says the balance was checked and is clear, instead of leaving
 * "no figure" ambiguous between "owes nothing" and "still loading".
 */
export function customerBalanceTrailing(balances: Map<string, number>, mobile: string): SearchSelectOption["trailing"] {
  const due = balances.get(mobile) || 0;
  return { text: due > 0 ? inr(due) : inr(0), tone: due > 0 ? "due" : "none", title: due > 0 ? "Balance due" : "Nothing due" };
}
