"use client";

import { useMemo } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useCustomers } from "@/hooks/use-customers";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import {
  getMonthly,
  getTailorStats,
  getGarmentStats,
  getCustMap,
  getAgingList,
  getPaymentStats,
  getSeasonalTrends,
  getCustomerLifetime,
  getStaffEfficiency,
  getTailorWorkload,
  getCustomGarmentRevenue,
  getPendingOrders,
  getLoyaltyImpact,
  getReadyUncollected,
  getReworkRate,
  getDepositCompliance,
  getBookingSourceBreakdown,
  getOrderProfitability,
} from "@/lib/analytics";

/** Shared aggregation for every /reports/* page — keeps each page a thin render layer. */
export function useReportsData() {
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const { data: loyaltyCfg } = useLoyaltyConfig();

  const list = orders || [];
  const custList = customers || [];

  const monthly = useMemo(() => getMonthly(list), [list]);
  const tailorStats = useMemo(() => getTailorStats(list), [list]);
  const garStats = useMemo(() => getGarmentStats(list), [list]);
  const custData = useMemo(() => getCustMap(list).sort((a, b) => b.spent - a.spent), [list]);
  const aging = useMemo(() => getAgingList(list), [list]);
  const paymentStats = useMemo(() => getPaymentStats(list), [list]);
  const seasonal = useMemo(() => getSeasonalTrends(list), [list]);
  const clvData = useMemo(() => getCustomerLifetime(list), [list]);
  const staffEff = useMemo(() => getStaffEfficiency(list), [list]);
  const workload = useMemo(() => getTailorWorkload(list), [list]);
  const customGarRev = useMemo(() => getCustomGarmentRevenue(list), [list]);
  const pending = useMemo(() => getPendingOrders(list), [list]);
  const loyaltyImpact = useMemo(() => getLoyaltyImpact(list, custList, loyaltyCfg), [list, custList, loyaltyCfg]);
  const readyUncollected = useMemo(() => getReadyUncollected(list), [list]);
  const reworkRate = useMemo(() => getReworkRate(list), [list]);
  const depositCompliance = useMemo(() => getDepositCompliance(list), [list]);
  const bookingSourceBreakdown = useMemo(() => getBookingSourceBreakdown(list), [list]);
  const orderProfitability = useMemo(() => getOrderProfitability(list), [list]);

  return {
    orders: list,
    isLoading: ordersLoading || customersLoading,
    monthly,
    tailorStats,
    garStats,
    custData,
    aging,
    paymentStats,
    seasonal,
    clvData,
    staffEff,
    workload,
    customGarRev,
    pending,
    loyaltyImpact,
    loyaltyCfg,
    readyUncollected,
    reworkRate,
    depositCompliance,
    bookingSourceBreakdown,
    orderProfitability,
  };
}
