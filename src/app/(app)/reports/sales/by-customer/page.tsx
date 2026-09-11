"use client";

import { useMemo, useState } from "react";
import { Link2, Receipt } from "lucide-react";
import Link from "next/link";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { inr } from "@/lib/format";
import { buildUnifiedSales, filterByType, type SaleTypeFilter } from "@/lib/unified-sales";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { SalesTypeFilter } from "@/components/reports/sales-type-filter";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue } from "@/components/ui/money-text";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

export default function SalesByCustomerPage() {
  const { data: orders, isLoading: l1 } = useOrders();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  const [filter, setFilter] = useState<SaleTypeFilter>("all");
  const isLoading = l1 || l2;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const rows = useMemo(() => {
    const unified = filterByType(buildUnifiedSales(orders || [], invoices || []), filter).filter((t) => isWithinDateRange(t.date, range));
    const map = new Map<string, { customerMobile: string; customerName: string; count: number; billed: number; paid: number; balance: number }>();
    unified.forEach((t) => {
      const row = map.get(t.customerMobile) || { customerMobile: t.customerMobile, customerName: t.customerName, count: 0, billed: 0, paid: 0, balance: 0 };
      row.count += 1;
      row.billed += t.billed;
      row.paid += t.paid;
      row.balance += t.balance;
      map.set(t.customerMobile, row);
    });
    return Array.from(map.values()).sort((a, b) => b.billed - a.billed);
  }, [orders, invoices, filter, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Sales by Customer"
      description="Revenue ranked by customer, combining Stitching Orders and Product Sales."
      actions={
        <ReportActionsMenu
          rows={rows.map((r) => ({ Customer: r.customerName, Mobile: r.customerMobile, Transactions: r.count, Billed: r.billed, Paid: r.paid, Balance: r.balance }))}
          filename="sales-by-customer"
          title="Sales by Customer"
          summaryLines={[`Customers: ${rows.length}`, `Total billed: ${inr(rows.reduce((s, r) => s + r.billed, 0))}`]}
        />
      }
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        category={<SalesTypeFilter value={filter} onChange={setFilter} />}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No sales yet" />
      ) : (
        <>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(rows.reduce((s, r) => s + r.billed, 0))} showChevron={false} />
              <MobileRecordRow label="Transactions" value={rows.reduce((s, r) => s + r.count, 0)} />
              <MobileRecordRow label="Paid" value={inr(rows.reduce((s, r) => s + r.paid, 0))} valueClassName="text-emerald-600 dark:text-emerald-400" />
              <MobileRecordRow label="Balance" value={inr(rows.reduce((s, r) => s + r.balance, 0))} />
            </MobileRecordCard>
            {rows.map((r) => (
              <MobileRecordCard key={r.customerMobile} href={r.customerMobile ? `/crm/${r.customerMobile}` : undefined}>
                <MobileRecordHeader title={r.customerName} value={inr(r.billed)} />
                <MobileRecordRow label="Transactions" value={r.count} />
                <MobileRecordRow label="Paid" value={inr(r.paid)} valueClassName="text-emerald-600 dark:text-emerald-400" />
                <MobileRecordRow label="Balance" value={r.balance > 0 ? <BalanceDue amount={r.balance} /> : <span className="text-muted-foreground">—</span>} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Customer</Th>
                  <Th align="right">Transactions</Th>
                  <Th align="right">Billed</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Balance</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{rows.reduce((s, r) => s + r.count, 0)}</Td>
                  <Td align="right">{inr(rows.reduce((s, r) => s + r.billed, 0))}</Td>
                  <Td align="right">{inr(rows.reduce((s, r) => s + r.paid, 0))}</Td>
                  <Td align="right">{inr(rows.reduce((s, r) => s + r.balance, 0))}</Td>
                  <Td align="right">—</Td>
                </ReportTotalsRow>
                {rows.map((r) => (
                  <tr key={r.customerMobile} className="hover:bg-muted/30">
                    <Td className="font-medium">{r.customerName}</Td>
                    <Td align="right">{r.count}</Td>
                    <Td align="right">{inr(r.billed)}</Td>
                    <Td align="right" className="text-emerald-600 dark:text-emerald-400">{inr(r.paid)}</Td>
                    <Td align="right">{r.balance > 0 ? <BalanceDue amount={r.balance} /> : <span className="text-muted-foreground">—</span>}</Td>
                    <Td align="right">
                      {r.customerMobile && (
                        <Link href={`/crm/${r.customerMobile}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <Link2 className="size-3" /> Profile
                        </Link>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
        </>
      )}
    </ReportShell>
  );
}
