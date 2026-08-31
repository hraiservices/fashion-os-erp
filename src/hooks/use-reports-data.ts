"use client";

import { useMemo } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useCustomers } from "@/hooks/use-customers";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import { useReferralCoupons } from "@/hooks/use-referral-coupons";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useOrderExpensesByOrderId } from "@/hooks/use-order-expenses";
import { DEFAULT_TAILOR_RATES, type TailorRateCard } from "@/lib/business-rules";
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
  getReorderCandidates,
  getTopReferrers,
} from "@/lib/analytics";

/** Shared aggregation for every /reports/* page — keeps each page a thin render layer. */
export function useReportsData() {
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const { data: loyaltyCfg } = useLoyaltyConfig();
  const { data: coupons } = useReferralCoupons();
  const { data: tailorRates } = useAppSetting<TailorRateCard>("tailorRates", DEFAULT_TAILOR_RATES);
  const { data: expensesByOrderId } = useOrderExpensesByOrderId();

  const list = useMemo(() => orders || [], [orders]);
  const custList = useMemo(() => customers || [], [customers]);
  const couponList = useMemo(() => coupons || [], [coupons]);

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
  const orderProfitability = useMemo(
    () => getOrderProfitability(list, tailorRates || DEFAULT_TAILOR_RATES, expensesByOrderId),
    [list, tailorRates, expensesByOrderId]
  );
  const reorderCandidates = useMemo(() => getReorderCandidates(list), [list]);
  const topReferrers = useMemo(() => getTopReferrers(couponList), [couponList]);

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
    reorderCandidates,
    topReferrers,
  };
}
