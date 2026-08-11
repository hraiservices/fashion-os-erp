"use client";

import { useMemo, useState } from "react";
import { Link2, Receipt } from "lucide-react";
import Link from "next/link";
import { useOrders } from "@/hooks/use-orders";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { inr } from "@/lib/format";
import { buildUnifiedSales, filterByType, type SaleTypeFilter } from "@/lib/unified-sales";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { SalesTypeFilter } from "@/components/reports/sales-type-filter";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue } from "@/components/ui/money-text";

export default function SalesByCustomerPage() {
  const { data: orders, isLoading: l1 } = useOrders();
  const { data: invoices, isLoading: l2 } = useSalesInvoices();
  const [filter, setFilter] = useState<SaleTypeFilter>("all");
  const isLoading = l1 || l2;

  const rows = useMemo(() => {
    const unified = filterByType(buildUnifiedSales(orders || [], invoices || []), filter);
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
  }, [orders, invoices, filter]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Sales by Customer"
      description="Revenue ranked by customer, combining Stitching Orders and Product Sales."
      actions={
        rows.length > 0 && (
          <ExportMenu
            rows={rows.map((r) => ({ Customer: r.customerName, Mobile: r.customerMobile, Transactions: r.count, Billed: r.billed, Paid: r.paid, Balance: r.balance }))}
            filename="sales_by_customer"
          />
        )
      }
    >
      <SalesTypeFilter value={filter} onChange={setFilter} />

      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No sales yet" />
      ) : (
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
      )}
    </ReportShell>
  );
}
