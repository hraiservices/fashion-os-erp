"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapOrderExpenseRow, type OrderExpense } from "@/lib/types";

async function fetchOrderExpenses(): Promise<OrderExpense[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("order_expenses").select("*");
  if (error) throw error;
  return (data || []).map(mapOrderExpenseRow);
}

/** All stitching-order expense rows, shop-wide — same "fetch the whole (small) table, group in
 *  memory" pattern as useOrders()/useSalesInvoices(), so every report/list page that needs
 *  per-order expenses shares one cached query instead of one request per order. */
export function useOrderExpenses() {
  return useQuery({
    queryKey: ["order-expenses"],
    queryFn: fetchOrderExpenses,
    staleTime: 30_000,
  });
}

export function useOrderExpensesByOrderId() {
  const { data, ...rest } = useOrderExpenses();
  const byOrderId = useMemo(() => {
    const map = new Map<string, OrderExpense[]>();
    for (const e of data || []) {
      const list = map.get(e.orderId);
      if (list) list.push(e);
      else map.set(e.orderId, [e]);
    }
    return map;
  }, [data]);
  return { data: byOrderId, ...rest };
}

/** One order's expenses — for the Edit Order form and Order Details page, where fetching the
 *  full table is unnecessary. Still backed by the same shared query/cache (no extra request). */
export function useOrderExpensesFor(orderId: string | undefined) {
  const { data, ...rest } = useOrderExpenses();
  const expenses = useMemo(() => (orderId ? (data || []).filter((e) => e.orderId === orderId) : []), [data, orderId]);
  return { data: expenses, ...rest };
}

export function useInvalidateOrderExpenses() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["order-expenses"] });
}
