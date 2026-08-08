"use client";

import { useMemo } from "react";
import { useOrders } from "@/hooks/use-orders";
import { getMonthly, getTailorStats, getCustMap, getGarmentStats } from "@/lib/analytics";
import { daysLeft, loyaltyDiscountOf } from "@/lib/business-rules";
import { isOrderOutstanding, getOrderOutstanding } from "@/lib/balances";

/** Shared stitching-side aggregation used by multiple dashboard widgets — kept in one place so every widget agrees on the same numbers. */
export function useDashboardStats() {
  const { data: orders, isLoading } = useOrders();

  const stats = useMemo(() => {
    if (!orders) return null;

    const active = orders.filter((o) => o.status !== "delivered" && o.status !== "payment");
    const overdue = active.filter((o) => daysLeft(o.deliveryDate) < 0);
    const ready = orders.filter((o) => o.status === "ready");
    const dueTodayCount = active.filter((o) => daysLeft(o.deliveryDate) === 0).length;

    const overdueOrders = orders.filter((o) => isOrderOutstanding(o) && daysLeft(o.deliveryDate) < 0);
    const currentOrders = orders.filter((o) => isOrderOutstanding(o) && daysLeft(o.deliveryDate) >= 0);
    const overdueBalance = overdueOrders.reduce((s, o) => s + getOrderOutstanding(o), 0);
    const currentBalance = currentOrders.reduce((s, o) => s + getOrderOutstanding(o), 0);
    const totalPending = overdueBalance + currentBalance;

    const totalRev = orders.reduce((s, o) => s + (o.total || 0), 0);
    // Same formula as the Monthly P&L report's "Collected" column (lib/analytics.ts getMonthly)
    // — real cash received, i.e. advance capped at total, minus any loyalty-point-funded
    // discount (which isn't cash). Using `total - balance` here would double-count loyalty
    // discounts as if they were collected cash, and silently disagree with Monthly P&L.
    const totalCollected = orders.reduce((s, o) => s + Math.max(0, Math.min(o.advance || 0, o.total || 0) - loyaltyDiscountOf(o)), 0);
    const totalUnpaid = totalRev - totalCollected;

    const custMap = getCustMap(orders);
    const repeatRate = custMap.length ? Math.round((custMap.filter((c) => c.orders.length > 1).length / custMap.length) * 100) : 0;
    const avgOrder = orders.length ? Math.round(totalRev / orders.length) : 0;

    const urgent = [...overdue, ...ready].filter((o, i, a) => a.findIndex((x) => x.id === o.id) === i).slice(0, 6);
    const monthly = getMonthly(orders);
    const garmentStats = getGarmentStats(orders).slice(0, 6);
    const pendingPayments = orders
      .filter(isOrderOutstanding)
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, 8);

    return {
      active,
      overdue,
      ready,
      dueTodayCount,
      totalPending,
      overdueBalance,
      currentBalance,
      totalRev,
      totalCollected,
      totalUnpaid,
      avgOrder,
      repeatRate,
      monthly,
      tailorStats: getTailorStats(orders).slice(0, 5),
      recent: orders.slice(0, 5),
      urgent,
      stageTotal: orders.length || 1,
      garmentStats,
      pendingPayments,
    };
  }, [orders]);

  return { orders: orders || [], stats, isLoading };
}
