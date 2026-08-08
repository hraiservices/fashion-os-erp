"use client";

import { useMemo } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useCustomers } from "@/hooks/use-customers";
import { buildCustomerLedger } from "@/lib/customer-ledger";

export function useCustomerLedger() {
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: invoices, isLoading: invoicesLoading } = useSalesInvoices();
  const { data: customers, isLoading: customersLoading } = useCustomers();

  const rows = useMemo(() => buildCustomerLedger(orders || [], invoices || [], customers || []), [orders, invoices, customers]);

  return { data: rows, isLoading: ordersLoading || invoicesLoading || customersLoading };
}
