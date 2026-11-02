"use client";

import { useMemo } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useExpenses } from "@/hooks/use-expenses";
import { useOrderExpenses } from "@/hooks/use-order-expenses";
import { useAllPayslips } from "@/hooks/use-payroll";
import { getCombinedForRange, detectSalaryOverlap } from "@/lib/combined-reports";
import type { DateRange } from "@/lib/report-date-range";

/** `range` honors the report's own date-filter bar — {from:"",to:""} ("All time") falls back to
 *  the trailing-6-month trend inside getCombinedForRange itself. Previously this hardcoded that
 *  6-month window regardless of what the filter bar showed selected, so picking "This month"
 *  changed nothing on screen; see getCombinedForRange's own comment for the full story. */
export function useCombinedPl(range: DateRange) {
  const { data: orders, isLoading: l1 } = useOrders();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  const { data: bills, isLoading: l3 } = usePurchaseBills();
  const { data: workOrders, isLoading: l4 } = useWorkOrders();
  const { data: expenses, isLoading: l5 } = useExpenses();
  const { data: orderExpenses, isLoading: l6 } = useOrderExpenses();
  const { data: payslips, isLoading: l7 } = useAllPayslips();

  const monthly = useMemo(
    () => getCombinedForRange(range, orders || [], invoices || [], bills || [], workOrders || [], expenses || [], orderExpenses || [], payslips || []),
    [range, orders, invoices, bills, workOrders, expenses, orderExpenses, payslips]
  );

  // Buckets where salary is probably being counted twice — once as a payslip, once as a
  // Salaries-category expense. Surfaced on the report rather than silently netted off.
  // payrollSalary comes off the computed bucket, so the warning can never disagree with the
  // payroll figure the table actually shows.
  const salaryOverlaps = useMemo(() => detectSalaryOverlap(monthly, expenses || []), [monthly, expenses]);

  return { monthly, salaryOverlaps, isLoading: l1 || l2 || l3 || l4 || l5 || l6 || l7 };
}
