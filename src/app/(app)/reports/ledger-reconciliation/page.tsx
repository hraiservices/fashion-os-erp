"use client";

import { DateText } from "@/components/ui/date-text";
import Link from "next/link";
import { ShieldCheck, Scale, AlertTriangle } from "lucide-react";
import { useLedgerReconciliation, type LedgerBreakRow } from "@/hooks/use-ledger-reconciliation";
import { useTableSort } from "@/hooks/use-table-sort";
import { fmtDate, inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

const SORT_COMPARATORS: Record<string, (a: LedgerBreakRow, b: LedgerBreakRow) => number> = {
  orderId: (a, b) => a.orderId.localeCompare(b.orderId),
  customer: (a, b) => a.customerName.localeCompare(b.customerName),
  inDate: (a, b) => a.inDate.localeCompare(b.inDate),
  total: (a, b) => a.total - b.total,
  storedAdvance: (a, b) => a.storedAdvance - b.storedAdvance,
  ledgerAdvance: (a, b) => a.ledgerAdvance - b.ledgerAdvance,
  advanceDrift: (a, b) => Math.abs(a.advanceDrift) - Math.abs(b.advanceDrift),
  balanceDrift: (a, b) => Math.abs(a.balanceDrift) - Math.abs(b.balanceDrift),
};
const SORT_DESC_KEYS = new Set(["total", "storedAdvance", "ledgerAdvance", "advanceDrift", "balanceDrift"]);

/**
 * Proves (or disproves) that every stitching order's stored advance/balance still agrees with the
 * order_payments ledger behind it. Invoices and bills derive their balance live, so they cannot
 * drift; orders store theirs, and every receivables report trusts the stored figure. This is the
 * control that makes that trust checkable — see the API route for why drift is possible at all.
 *
 * Reports breaks only; it never writes a correction, because deciding which side is right is a
 * judgement about real money.
 */
export default function LedgerReconciliationPage() {
  const { data, isLoading, isError, error } = useLedgerReconciliation();
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<LedgerBreakRow>("ledger-reconciliation", SORT_COMPARATORS, SORT_DESC_KEYS);

  const breaks = data?.breaks || [];
  const sortedRows = applySort(breaks);

  const exportRows = sortedRows.map((r) => ({
    Order: r.orderId,
    Customer: r.customerName,
    Mobile: r.mobile,
    Date: r.inDate,
    Total: r.total,
    "Stored Advance": r.storedAdvance,
    "Ledger Advance": r.ledgerAdvance,
    "Advance Drift": r.advanceDrift,
    "Stored Balance": r.storedBalance,
    "Expected Balance": r.expectedBalance,
    "Balance Drift": r.balanceDrift,
    Overpaid: r.overpaid ? "Yes" : "No",
  }));

  return (
    <ReportShell
      title="Ledger Reconciliation"
      description="Checks every stitching order's stored advance and balance against the payments ledger behind it. A clean run means receivables can be trusted."
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="ledger-reconciliation"
          title="Ledger Reconciliation"
          summaryLines={[
            `Orders checked: ${data?.checkedOrders ?? 0}`,
            `Breaks found: ${data?.breakCount ?? 0}`,
            `Net advance drift: ₹${data?.totalAdvanceDrift ?? 0}`,
          ]}
          hideWhatsApp
        />
      }
    >
      {isLoading && <Skeleton className="h-96 w-full" />}

      {isError && <EmptyState icon={AlertTriangle} title="Couldn't run the reconciliation" description={error instanceof Error ? error.message : "Try again."} />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Orders checked" value={data.checkedOrders} icon={Scale} />
            <StatCard label="Payments checked" value={data.checkedPayments} icon={Scale} />
            <StatCard label="Breaks found" value={data.breakCount} icon={data.breakCount > 0 ? AlertTriangle : ShieldCheck} tone={data.breakCount > 0 ? "danger" : "default"} />
            <StatCard label="Net advance drift" value={inr(data.totalAdvanceDrift)} icon={Scale} tone={Math.abs(data.totalAdvanceDrift) > 0.01 ? "danger" : "default"} />
          </div>

          {breaks.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Everything reconciles"
              description={`All ${data.checkedOrders} orders agree with the ${data.checkedPayments} payments recorded against them. No drift, no overpayments.`}
            />
          ) : (
            <>
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                <p className="font-medium">{breaks.length} order{breaks.length === 1 ? "" : "s"} do not reconcile.</p>
                <p className="mt-1 text-muted-foreground">
                  &quot;Stored&quot; is what the order record says and what every receivables report uses. &quot;Ledger&quot; is the sum of the
                  payments actually recorded against it. Where they differ, one of the two is wrong — check the order&apos;s payment history
                  before trusting its balance. Nothing here has been changed automatically.
                </p>
              </div>

              <div className="hidden sm:block">
                <ReportTable>
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <Th sortKey="orderId" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Order</Th>
                      <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
                      <Th sortKey="inDate" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Date</Th>
                      <Th sortKey="total" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Total</Th>
                      <Th sortKey="storedAdvance" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Stored Advance</Th>
                      <Th sortKey="ledgerAdvance" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Ledger Advance</Th>
                      <Th sortKey="advanceDrift" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Advance Drift</Th>
                      <Th sortKey="balanceDrift" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Balance Drift</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedRows.map((r) => (
                      <tr key={r.orderId} className="hover:bg-muted/30">
                        <Td className="font-medium">
                          <Link href={`/orders/${r.orderId}`} className="hover:underline">{r.orderId}</Link>
                          {r.overpaid && <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">OVERPAID</span>}
                        </Td>
                        <Td>{r.customerName}</Td>
                        <Td className="whitespace-nowrap text-muted-foreground"><DateText>{fmtDate(r.inDate)}</DateText></Td>
                        <Td className="tabular-nums">{inr(r.total)}</Td>
                        <Td className="tabular-nums">{inr(r.storedAdvance)}</Td>
                        <Td className="tabular-nums">{inr(r.ledgerAdvance)}</Td>
                        <Td className={`tabular-nums font-medium ${Math.abs(r.advanceDrift) > 0.01 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                          {r.advanceDrift > 0 ? "+" : ""}{inr(r.advanceDrift)}
                        </Td>
                        <Td className={`tabular-nums font-medium ${Math.abs(r.balanceDrift) > 0.01 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                          {r.balanceDrift > 0 ? "+" : ""}{inr(r.balanceDrift)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </ReportTable>
              </div>

              <MobileRecordList>
                {sortedRows.map((r) => (
                  <MobileRecordCard key={r.orderId}>
                    <Link href={`/orders/${r.orderId}`}>
                      <MobileRecordHeader title={`${r.orderId} · ${r.customerName}`} value={inr(r.total)} />
                    </Link>
                    <MobileRecordRow label="Stored advance" value={inr(r.storedAdvance)} />
                    <MobileRecordRow label="Ledger advance" value={inr(r.ledgerAdvance)} />
                    <MobileRecordRow label="Advance drift" value={`${r.advanceDrift > 0 ? "+" : ""}${inr(r.advanceDrift)}`} />
                    <MobileRecordRow label="Balance drift" value={`${r.balanceDrift > 0 ? "+" : ""}${inr(r.balanceDrift)}`} />
                  </MobileRecordCard>
                ))}
              </MobileRecordList>
            </>
          )}
        </>
      )}
    </ReportShell>
  );
}
