"use client";

import { useMemo } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useCustomers } from "@/hooks/use-customers";
import { buildCustomerMap } from "@/lib/crm";

export function useCustomerProfiles() {
  const { data: orders, isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useOrders();
  const { data: customers, isLoading: customersLoading, isError: customersError, refetch: refetchCustomers } = useCustomers();

  const profiles = useMemo(() => buildCustomerMap(orders || [], customers || []), [orders, customers]);

  // isError is surfaced so the CRM page can tell "we couldn't load this" apart from "you have
  // no customers" — rendering the empty state on a failed fetch told the owner their customer
  // book was empty when it was only unreachable.
  return {
    profiles,
    isLoading: ordersLoading || customersLoading,
    isError: ordersError || customersError,
    refetch: () => {
      refetchOrders();
      refetchCustomers();
    },
  };
}
