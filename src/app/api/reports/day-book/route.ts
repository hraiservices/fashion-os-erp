import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { istDayBoundsUtc } from "@/lib/ist-date";
import {
  buildSalesInvoiceEntries,
  buildSalesPaymentEntries,
  buildSalesCreditNoteEntries,
  buildExpenseEntries,
  buildPurchaseBillEntries,
  buildVendorPaymentEntries,
  buildVendorCreditEntries,
  buildOrderCreatedEntries,
  buildOrderActivityLogEntries,
  buildOrderPaymentEntries,
  buildCustomerCreatedEntries,
  buildCustomerActivityLogEntries,
  buildAttendanceEntries,
  buildLeaveAppliedEntries,
  buildLeaveDecidedEntries,
  buildPayslipPaidEntries,
  buildAdvanceEntries,
  buildOtherActivityLogEntries,
  sortEntries,
  type DayBookEntry,
} from "@/lib/day-book";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Day Book: everything that happened in the system on one shop-local date, across every
 * module. Every query below is scoped to that single day server-side (timestamptz columns via
 * istDayBoundsUtc, plain date columns via equality) — nothing fetches a whole table and filters
 * in the browser, so this stays cheap regardless of total historical volume. Financial totals
 * are summed here from the same raw rows the entries are built from (never re-derived from the
 * free-text activity_log), so they can't silently diverge from what Combined P&L or the
 * invoice/bill list pages would show for the same records.
 */
export async function GET(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.viewReports) return NextResponse.json({ error: "No permission to view reports" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "Invalid or missing date (expected YYYY-MM-DD)" }, { status: 400 });

  // Every table below is read-scoped for `authenticated` after lockdown_reads_whole_table.sql /
  // lockdown_reads_per_row.sql, and viewReports is not the permission that opens most of them —
  // a manager without managePurchases would silently get a Day Book with the purchases half
  // missing, which is worse than an error because the totals would still add up. The viewReports
  // check above (and canSeePayroll below) is the authority; the service client makes the reads
  // complete.
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { startUtc, endUtc } = istDayBoundsUtc(date);
  const canSeePayroll = !!user.perms.managePayroll;

  const [
    invoicesRes,
    paymentsRes,
    creditNotesRes,
    expensesRes,
    billsRes,
    vendorPaymentsRes,
    vendorCreditsRes,
    ordersRes,
    orderActivityRes,
    orderPaymentsRes,
    customersRes,
    unlinkedActivityRes,
    attendanceRes,
    leaveAppliedRes,
    leaveDecidedRes,
    employeesRes,
    vendorsRes,
    completedWorkOrdersRes,
  ] = await Promise.all([
    db.from("sales_invoices").select("id, invoice_number, customer_name, customer_mobile, total, doc_status, created_by, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("sales_payments").select("id, invoice_id, customer_mobile, amount, method, created_by, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("sales_credit_notes").select("id, credit_number, invoice_id, total, reason, created_by, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("expenses").select("id, category, description, amount, pay_method, created_by, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("purchase_bills").select("id, bill_number, vendor_id, total, created_by, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("vendor_payments").select("id, bill_id, vendor_id, amount, method, created_by, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("vendor_credits").select("id, credit_number, vendor_id, bill_id, total, reason, created_by, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("orders").select("id, name, mobile, total, advance, status, created_at, garments, fabric_cost, other_cost").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("activity_log").select("id, user_email, user_name, action, order_id, details, created_at").not("order_id", "is", null).gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("order_payments").select("id, order_id, amount, pt_discount, method, note, created_by, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("customers").select("id, name, mobile, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
    // Every activity_log row not tied to an order (already covered by orderActivityRes above) —
    // split into customer-update vs. everything-else in JS below, rather than duplicating the
    // same ilike patterns across two separate queries.
    db.from("activity_log").select("id, user_email, user_name, action, order_id, details, created_at").is("order_id", null).gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("employee_attendance").select("id, employee_id, status, check_in_at, check_out_at, hours_worked, overtime_hours, created_by").eq("date", date),
    db.from("leave_requests").select("id, employee_id, from_date, to_date, days, status, requested_by, requested_at, decided_by, decided_at").gte("requested_at", startUtc).lt("requested_at", endUtc),
    db.from("leave_requests").select("id, employee_id, from_date, to_date, days, status, requested_by, requested_at, decided_by, decided_at").gte("decided_at", startUtc).lt("decided_at", endUtc),
    db.from("employees").select("id, name"),
    db.from("vendors").select("id, name"),
    // Mirrors getCombinedMonthly's laborCost — completed work orders' labor cost, bucketed by
    // completedAt, the same date basis Combined P&L uses for this category.
    db.from("work_orders").select("id, labor_cost").eq("status", "completed").gte("completed_at", startUtc).lt("completed_at", endUtc),
  ]);

  const firstError = [
    invoicesRes, paymentsRes, creditNotesRes, expensesRes, billsRes, vendorPaymentsRes, vendorCreditsRes,
    ordersRes, orderActivityRes, orderPaymentsRes, customersRes, unlinkedActivityRes, attendanceRes,
    leaveAppliedRes, leaveDecidedRes, employeesRes, vendorsRes, completedWorkOrdersRes,
  ].find((r) => r.error);
  if (firstError?.error) return NextResponse.json({ error: firstError.error.message }, { status: 500 });

  const employeeNameById = new Map((employeesRes.data || []).map((e) => [e.id, e.name]));
  const vendorNameById = new Map((vendorsRes.data || []).map((v) => [v.id, v.name]));

  // Payroll is sensitive HR data (same rule as employee salary fields elsewhere in this app) —
  // only fetched/included when the requester actually holds managePayroll, not just viewReports.
  let payslipEntries: DayBookEntry[] = [];
  let advanceEntries: DayBookEntry[] = [];
  let payrollTotal = 0;
  let payrollCostForProfit = 0;
  if (canSeePayroll) {
    const [payslipsRes, advancesRes] = await Promise.all([
      db.from("payslips").select("id, employee_id, net_pay, piece_rate_pay, status, paid_at").eq("status", "paid").gte("paid_at", startUtc).lt("paid_at", endUtc),
      db.from("employee_advances").select("id, employee_id, amount, note, created_by, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
    ]);
    if (payslipsRes.error) return NextResponse.json({ error: payslipsRes.error.message }, { status: 500 });
    if (advancesRes.error) return NextResponse.json({ error: advancesRes.error.message }, { status: 500 });
    payslipEntries = buildPayslipPaidEntries(payslipsRes.data || [], employeeNameById);
    advanceEntries = buildAdvanceEntries(advancesRes.data || [], employeeNameById);
    payrollTotal = payslipEntries.reduce((s, e) => s + (e.amount || 0), 0);
    // Salary only, mirroring getCombinedMonthly — pieceRatePay is excluded because that exact
    // money is already counted in stitchingCost below (the garment's frozen payableAmount).
    // Counting a payslip's full net_pay here would double-charge every tailor's piece-rate.
    payrollCostForProfit = (payslipsRes.data || []).reduce((s, p) => s + Math.max(0, (p.net_pay || 0) - (p.piece_rate_pay || 0)), 0);
  }

  // Invoice/bill lookup for payments and credit notes that reference a document created on a
  // different day than the payment/credit itself.
  const invoiceIds = new Set<string>([
    ...(paymentsRes.data || []).map((p) => p.invoice_id),
    ...(creditNotesRes.data || []).map((c) => c.invoice_id),
  ]);
  const { data: invoiceLookupRows } = invoiceIds.size
    ? await db.from("sales_invoices").select("id, invoice_number, customer_name").in("id", Array.from(invoiceIds))
    : { data: [] };
  const invoiceByIdMap = new Map((invoiceLookupRows || []).map((i) => [i.id, { invoiceNumber: i.invoice_number, customerName: i.customer_name }]));

  const billIds = new Set<string>([
    ...(vendorPaymentsRes.data || []).map((p) => p.bill_id),
  ]);
  const { data: billLookupRows } = billIds.size ? await db.from("purchase_bills").select("id, bill_number").in("id", Array.from(billIds)) : { data: [] };
  const billNumberById = new Map((billLookupRows || []).map((b) => [b.id, b.bill_number]));

  // Orders referenced by a payment made today but created a different day — same cross-day
  // reference-lookup reasoning as invoiceByIdMap/billNumberById above.
  const paidOrderIds = new Set<string>((orderPaymentsRes.data || []).map((p) => p.order_id));
  const { data: paidOrderLookupRows } = paidOrderIds.size
    ? await db.from("orders").select("id, name, mobile").in("id", Array.from(paidOrderIds))
    : { data: [] };
  const orderByIdMap = new Map((paidOrderLookupRows || []).map((o) => [o.id, { name: o.name, mobile: o.mobile }]));

  // Order creators are resolved from the same-day activity_log rows already fetched above
  // (the "📋 New order created" line lands within seconds of orders.created_at) — orders has no
  // created_by column of its own.
  const creatorByOrderId = new Map<string, string | null>();
  for (const r of orderActivityRes.data || []) {
    if (r.order_id && r.action.startsWith("📋 New order")) creatorByOrderId.set(r.order_id, r.user_email);
  }

  // Per-order stitching expense line items for today's orders, for the stitchingCost total below.
  const todayOrderIds = (ordersRes.data || []).map((o) => o.id);
  const { data: orderExpenseRows } = todayOrderIds.length
    ? await db.from("order_expenses").select("order_id, amount").in("order_id", todayOrderIds)
    : { data: [] };
  const orderExpenseByOrderId = new Map<string, number>();
  for (const e of orderExpenseRows || []) {
    orderExpenseByOrderId.set(e.order_id, (orderExpenseByOrderId.get(e.order_id) || 0) + (e.amount || 0));
  }

  const entries: DayBookEntry[] = [
    ...buildSalesInvoiceEntries(invoicesRes.data || []),
    ...buildSalesPaymentEntries(paymentsRes.data || [], invoiceByIdMap),
    ...buildSalesCreditNoteEntries(creditNotesRes.data || [], invoiceByIdMap),
    ...buildExpenseEntries(expensesRes.data || []),
    ...buildPurchaseBillEntries(billsRes.data || [], vendorNameById),
    ...buildVendorPaymentEntries(vendorPaymentsRes.data || [], vendorNameById, billNumberById),
    ...buildVendorCreditEntries(vendorCreditsRes.data || [], vendorNameById),
    ...buildOrderCreatedEntries(ordersRes.data || [], creatorByOrderId),
    ...buildOrderActivityLogEntries(orderActivityRes.data || []),
    ...buildOrderPaymentEntries(orderPaymentsRes.data || [], orderByIdMap),
    ...buildCustomerCreatedEntries(customersRes.data || []),
    ...buildCustomerActivityLogEntries(unlinkedActivityRes.data || []),
    ...buildAttendanceEntries(attendanceRes.data || [], employeeNameById, startUtc),
    ...buildLeaveAppliedEntries(leaveAppliedRes.data || [], employeeNameById),
    ...buildLeaveDecidedEntries(leaveDecidedRes.data || [], employeeNameById),
    ...payslipEntries,
    ...advanceEntries,
    ...buildOtherActivityLogEntries(unlinkedActivityRes.data || []),
  ];

  // Reconciliation totals — summed directly from the raw rows above, independent of the
  // free-text activity_log entries mixed into the timeline, so these numbers can't be thrown
  // off by e.g. the regex-extracted order-payment amounts in buildOrderActivityLogEntries.
  const salesTotal = (invoicesRes.data || []).filter((i) => i.doc_status !== "draft").reduce((s, i) => s + i.total, 0);
  // "Payments Received" covers cash collected across BOTH revenue streams — sales_payments
  // (retail invoices) and order_payments (stitching orders), summed straight from real columns
  // on both sides now, so this can never diverge from what the timeline above shows for the day.
  const orderPaymentsTotal = (orderPaymentsRes.data || []).reduce((s, p) => s + p.amount, 0);
  const paymentsTotal = (paymentsRes.data || []).reduce((s, p) => s + p.amount, 0) + orderPaymentsTotal;
  const expensesTotal = (expensesRes.data || []).reduce((s, e) => s + e.amount, 0);
  const purchasesTotal = (billsRes.data || []).reduce((s, b) => s + b.total, 0);
  const refundsTotal =
    (creditNotesRes.data || []).reduce((s, c) => s + c.total, 0) + (vendorCreditsRes.data || []).reduce((s, c) => s + c.total, 0);
  const stitchingRevenue = (ordersRes.data || []).reduce((s, o) => s + o.total, 0);

  // Was previously omitted entirely — profit counted the full order/invoice value as margin
  // with none of the direct cost of fulfilling it subtracted, overstating profit by the whole
  // cost of goods/labor. Mirrors getCombinedMonthly's formula (src/lib/combined-reports.ts)
  // term-for-term (stitchingCost = tailor payables + fabric/other cost + order expenses,
  // laborCost = completed work orders, payrollCost = salary net of piece-rate already counted
  // in stitchingCost) so Day Book profit for a date agrees with Combined P&L for that month.
  const stitchingCost = (ordersRes.data || []).reduce((s, o) => {
    const garments = (o.garments as unknown as { payableAmount?: number }[]) || [];
    const tailorCost = garments.reduce((g, garment) => g + (garment.payableAmount || 0), 0);
    return s + tailorCost + (o.fabric_cost || 0) + (o.other_cost || 0) + (orderExpenseByOrderId.get(o.id) || 0);
  }, 0);
  const laborCost = (completedWorkOrdersRes.data || []).reduce((s, w) => s + (w.labor_cost || 0), 0);
  const salesCreditsTotal = (creditNotesRes.data || []).reduce((s, c) => s + c.total, 0);

  const profit = stitchingRevenue + salesTotal - salesCreditsTotal - purchasesTotal - expensesTotal - stitchingCost - laborCost - payrollCostForProfit;

  const totals = {
    sales: salesTotal,
    payments: paymentsTotal,
    expenses: expensesTotal,
    purchases: purchasesTotal,
    refunds: refundsTotal,
    profit,
    payroll: payrollTotal,
    invoicesCreated: (invoicesRes.data || []).length,
    ordersCreated: (ordersRes.data || []).length,
    customersAdded: (customersRes.data || []).length,
    attendanceEvents: (attendanceRes.data || []).length,
    totalActivities: entries.length,
  };

  return NextResponse.json({
    date,
    entries: sortEntries(entries, "asc"),
    totals,
    canSeePayroll,
  });
}
