"use client";

import { useMemo } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useExpenses } from "@/hooks/use-expenses";
import { getCombinedMonthly } from "@/lib/combined-reports";

export function useCombinedPl() {
  const { data: orders, isLoading: l1 } = useOrders();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  const { data: bills, isLoading: l3 } = usePurchaseBills();
  const { data: workOrders, isLoading: l4 } = useWorkOrders();
  const { data: expenses, isLoading: l5 } = useExpenses();

  const monthly = useMemo(
    () => getCombinedMonthly(orders || [], invoices || [], bills || [], workOrders || [], expenses || []),
    [orders, invoices, bills, workOrders, expenses]
  );

  return { monthly, isLoading: l1 || l2 || l3 || l4 || l5 };
}
