"use client";

import { useMemo } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { useExpenses } from "@/hooks/use-expenses";
import { useVendors } from "@/hooks/use-vendors";
import { useCustomers } from "@/hooks/use-customers";
import { computeCustomCardValue, type CustomCardConfig } from "@/lib/custom-card";

/**
 * Computes a custom card's live value. All source hooks are called unconditionally (required
 * by the Rules of Hooks) — React Query dedupes them against whatever else on the page already
 * fetched the same data, so this doesn't add real network overhead.
 */
export function useCustomCardValue(config: CustomCardConfig) {
  const { data: orders, isLoading: l1 } = useOrders();
  const { data: salesInvoices, isLoading: l2 } = useSalesInvoices();
  const { data: purchaseBills, isLoading: l3 } = usePurchaseBills();
  const { data: workOrders, isLoading: l4 } = useWorkOrders();
  const { data: rawMaterials, isLoading: l5 } = useRawMaterials();
  const { data: products, isLoading: l6 } = useProducts();
  const { data: expenses, isLoading: l7 } = useExpenses();
  const { data: vendors, isLoading: l8 } = useVendors();
  const { data: customers, isLoading: l9 } = useCustomers();

  const rows = useMemo(() => {
    switch (config.dataSource) {
      case "orders":
        return orders || [];
      case "salesInvoices":
        return salesInvoices || [];
      case "purchaseBills":
        return purchaseBills || [];
      case "workOrders":
        return workOrders || [];
      case "rawMaterials":
        return rawMaterials || [];
      case "products":
        return products || [];
      case "expenses":
        return expenses || [];
      case "vendors":
        return vendors || [];
      case "customers":
        return customers || [];
      default:
        return [];
    }
  }, [config.dataSource, orders, salesInvoices, purchaseBills, workOrders, rawMaterials, products, expenses, vendors, customers]);

  const value = useMemo(() => computeCustomCardValue(config, rows as unknown as Record<string, unknown>[]), [config, rows]);
  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8 || l9;

  return { value, isLoading };
}
