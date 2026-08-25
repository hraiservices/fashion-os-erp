"use client";

import { useMemo } from "react";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Scale } from "lucide-react";
import { useAllSalesPayments } from "@/hooks/use-sales-payments";
import { useAllVendorPayments } from "@/hooks/use-vendor-payments";
import { useOrderPaymentActivity } from "@/hooks/use-activity-log";
import { extractOrderPayments } from "@/lib/day-book";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

interface MethodRow {
  method: string;
  count: number;
  amount: number;
}

function byMethod(payments: { method: string; amount: number }[]): MethodRow[] {
  const map = new Map<string, MethodRow>();
  payments.forEach((p) => {
    const row = map.get(p.method) || { method: p.method || "Other", count: 0, amount: 0 };
    row.count += 1;
    row.amount += p.amount;
    map.set(p.method, row);
  });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

function MethodTable({ rows, total, emptyLabel }: { rows: MethodRow[]; total: number; emptyLabel: string }) {
  if (rows.length === 0) return <EmptyState icon={Wallet} title={emptyLabel} className="border-0" />;
  return (
    <ReportTable>
      <thead className="border-b bg-muted/40">
        <tr>
          <Th>Method</Th>
          <Th align="right">Transactions</Th>
          <Th align="right">Amount</Th>
          <Th align="right">% of Total</Th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r) => (
          <tr key={r.method} className="hover:bg-muted/30">
            <Td className="font-medium">{r.method}</Td>
            <Td align="right">{r.count}</Td>
            <Td align="right">{inr(r.amount)}</Td>
            <Td align="right" className="text-muted-foreground">
              {total > 0 ? ((r.amount / total) * 100).toFixed(1) : "0.0"}%
            </Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t bg-muted/30 font-semibold">
          <td className="px-3 py-2.5">Total</td>
          <td className="px-3 py-2.5 text-right tabular-nums">{rows.reduce((s, r) => s + r.count, 0)}</td>
          <td className="px-3 py-2.5 text-right tabular-nums">{inr(total)}</td>
          <td className="px-3 py-2.5" />
        </tr>
      </tfoot>
    </ReportTable>
  );
}

export default function PaymentMethodsReportPage() {
  const { data: salesPayments, isLoading: l1 } = useAllSalesPayments();
  const { data: vendorPayments, isLoading: l2 } = useAllVendorPayments();
  const { data: orderPaymentRows, isLoading: l3 } = useOrderPaymentActivity();
  const isLoading = l1 || l2 || l3;

  // Both revenue streams — sales_payments (product sales) has a real `method` column; stitching
  // orders have no standalone payments table, so their method is extracted from the same
  // activity_log text Day Book already parses (see extractOrderPayments). Combined so this
  // report actually reflects every rupee to reconcile against a bank deposit, not just retail.
  const orderPayments = useMemo(() => extractOrderPayments(orderPaymentRows || []), [orderPaymentRows]);
  const receivedByMethod = useMemo(() => byMethod([...(salesPayments || []), ...orderPayments]), [salesPayments, orderPayments]);
  const madeByMethod = useMemo(() => byMethod(vendorPayments || []), [vendorPayments]);
  const totalReceived = useMemo(() => receivedByMethod.reduce((s, r) => s + r.amount, 0), [receivedByMethod]);
  const totalMade = useMemo(() => madeByMethod.reduce((s, r) => s + r.amount, 0), [madeByMethod]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell title="Payment Methods" description="Cash, UPI, bank transfer and card totals across stitching orders and product sales — useful for daily reconciliation against your bank deposits">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Payments Received" value={inr(totalReceived)} icon={ArrowDownCircle} />
        <StatCard label="Payments Made" value={inr(totalMade)} icon={ArrowUpCircle} />
        <StatCard label="Net Cash Flow" value={inr(totalReceived - totalMade)} icon={Scale} tone={totalReceived - totalMade >= 0 ? "success" : "danger"} />
        <StatCard label="Transactions" value={receivedByMethod.reduce((s, r) => s + r.count, 0) + madeByMethod.reduce((s, r) => s + r.count, 0)} icon={Wallet} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Payments received by method</h2>
        <MethodTable rows={receivedByMethod} total={totalReceived} emptyLabel="No payments received yet" />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Payments made by method</h2>
        <MethodTable rows={madeByMethod} total={totalMade} emptyLabel="No payments made yet" />
      </div>
    </ReportShell>
  );
}
