"use client";

import { Scissors, ShoppingBag, Banknote, Boxes, AlertTriangle, Truck, Factory, Wallet } from "lucide-react";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { isLowStock } from "@/lib/inventory";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";

/** Small KPI tiles for the newer modules — each self-fetches so it can be shown/hidden independently. */

export function StitchingDuesWidget() {
  const { stats, isLoading } = useDashboardStats();
  if (isLoading || !stats) return <Skeleton className="h-24 w-full" />;
  return <StatCard label="Stitching Dues" value={inr(stats.totalPending)} icon={Scissors} tone={stats.totalPending > 0 ? "warning" : "default"} href="/reports/aging" />;
}

export function SalesDuesWidget() {
  const { data: invoices, isLoading } = useSalesInvoices();
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  const salesDues = (invoices || []).reduce((s, i) => s + i.balance, 0);
  return <StatCard label="Product Sales Dues" value={inr(salesDues)} icon={ShoppingBag} tone={salesDues > 0 ? "warning" : "default"} href="/sales/invoices" />;
}

export function TotalReceivableWidget() {
  const { stats, isLoading: l1 } = useDashboardStats();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  if (l1 || l2 || !stats) return <Skeleton className="h-24 w-full" />;
  const salesDues = (invoices || []).reduce((s, i) => s + i.balance, 0);
  const total = stats.totalPending + salesDues;
  return <StatCard label="Total Receivable" value={inr(total)} icon={Banknote} tone={total > 0 ? "warning" : "default"} href="/reports/customer-balances" />;
}

export function InventoryValueWidget() {
  const { data: rawMaterials, isLoading: l1 } = useRawMaterials();
  const { data: products, isLoading: l2 } = useProducts();
  if (l1 || l2) return <Skeleton className="h-24 w-full" />;
  const value = (rawMaterials || []).reduce((s, m) => s + m.stockQty * m.costPerUnit, 0) + (products || []).reduce((s, p) => s + p.stockQty * p.costPrice, 0);
  return <StatCard label="Inventory Value" value={inr(value)} icon={Boxes} href="/reports/inventory" />;
}

export function LowStockItemsWidget() {
  const { data: rawMaterials, isLoading: l1 } = useRawMaterials();
  const { data: products, isLoading: l2 } = useProducts();
  if (l1 || l2) return <Skeleton className="h-24 w-full" />;
  const count = (rawMaterials || []).filter((m) => isLowStock(m.stockQty, m.lowStockAlert)).length + (products || []).filter((p) => isLowStock(p.stockQty, p.lowStockAlert)).length;
  return <StatCard label="Low Stock Items" value={count} icon={AlertTriangle} tone={count > 0 ? "warning" : "default"} href="/inventory" />;
}

export function PurchasesPayableWidget() {
  const { data: bills, isLoading } = usePurchaseBills();
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  const payable = (bills || []).reduce((s, b) => s + b.balance, 0);
  return <StatCard label="Purchases Payable" value={inr(payable)} icon={Truck} tone={payable > 0 ? "warning" : "default"} href="/reports/purchases" />;
}

export function ManufacturingActiveWidget() {
  const { data: workOrders, isLoading } = useWorkOrders();
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  const active = (workOrders || []).filter((w) => w.status !== "completed").length;
  return <StatCard label="Active Work Orders" value={active} icon={Factory} href="/manufacturing" />;
}

export function ManufacturingCostWidget() {
  const { data: workOrders, isLoading } = useWorkOrders();
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  const cost = (workOrders || []).filter((w) => w.status === "completed").reduce((s, w) => s + (w.totalCost || 0), 0);
  return <StatCard label="Production Cost" value={inr(cost)} icon={Wallet} href="/reports/manufacturing" />;
}
