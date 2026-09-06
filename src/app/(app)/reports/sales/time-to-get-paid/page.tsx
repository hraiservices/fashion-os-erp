"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { avgDaysToGetPaid } from "@/lib/sales";
import { fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/**
 * Only fully-paid invoices have a "time to get paid" — a partial payment means the invoice
 * isn't paid yet, so it isn't counted here (matches the same fully-settled definition used
 * by the Sales Invoices list's "Avg. Days to Get Paid" stat — see lib/sales.ts avgDaysToGetPaid).
 */
export default function TimeToGetPaidPage() {
  const { data: invoices, isLoading } = useSalesInvoices();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const rows = useMemo(() => {
    return (invoices || [])
      .filter((inv) => inv.paymentStatus === "paid" && inv.lastPaymentDate)
      .filter((inv) => isWithinDateRange(inv.invoiceDate, range))
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        invoiceDate: inv.invoiceDate,
        lastPaymentDate: inv.lastPaymentDate as string,
        paymentStatus: inv.paymentStatus,
        days: Math.max(0, Math.round((new Date(inv.lastPaymentDate as string).getTime() - new Date(inv.invoiceDate).getTime()) / 86_400_000)),
      }))
      .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
  }, [invoices, range]);

  const avgDays = avgDaysToGetPaid(invoices || []);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Time to Get Paid"
      description="Days between invoice date and the payment that fully settled it."
      actions={
        rows.length > 0 && (
          <ExportMenu
            rows={rows.map((r) => ({ Invoice: r.invoiceNumber, Customer: r.customerName, "Invoice Date": r.invoiceDate, "Last Payment": r.lastPaymentDate, "Days to Pay": r.days }))}
            filename="time_to_get_paid"
          />
        )
      }
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Avg. Days to Get Paid" value={avgDays != null ? `${avgDays}d` : "—"} icon={Clock} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Clock} title="No fully-paid invoices yet" description="Invoices that have been paid in full will appear here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Invoice</Th>
              <Th>Customer</Th>
              <Th>Invoice Date</Th>
              <Th>Last Payment</Th>
              <Th align="right">Days to Pay</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <Td className="font-medium">
                  <Link href={`/sales/invoices/${r.id}`} className="text-primary hover:underline">
                    {r.invoiceNumber}
                  </Link>
                </Td>
                <Td>{r.customerName}</Td>
                <Td className="text-muted-foreground">{fmtDate(r.invoiceDate)}</Td>
                <Td className="text-muted-foreground">{fmtDate(r.lastPaymentDate)}</Td>
                <Td align="right" className={r.days <= 7 ? "text-emerald-600 dark:text-emerald-400" : r.days <= 30 ? "" : "text-red-600 dark:text-red-400"}>
                  {r.days}d
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
