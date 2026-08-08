"use client";

import { useMemo } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useCustomers } from "@/hooks/use-customers";
import { buildCustomerMap } from "@/lib/crm";

export function useCustomerProfiles() {
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: customers, isLoading: customersLoading } = useCustomers();

  const profiles = useMemo(() => buildCustomerMap(orders || [], customers || []), [orders, customers]);

  return { profiles, isLoading: ordersLoading || customersLoading };
}
