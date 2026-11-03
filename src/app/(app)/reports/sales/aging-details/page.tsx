"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ReceiptDuotoneIcon } from "@/components/icons/duotone-icons";

import { useSalesInvoices, type SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import { daysLeft } from "@/lib/business-rules";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";
import { CustomerLink } from "@/components/crm/customer-link";

type AgingDetailRow = SalesInvoiceWithBalance & { daysOverdue: number };

const SORT_COMPARATORS: Record<string, (a: AgingDetailRow, b: AgingDetailRow) => number> = {
  invoice: (a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber),
  customer: (a, b) => a.customerName.localeCompare(b.customerName),
  dueDate: (a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""),
  balance: (a, b) => a.balance - b.balance,
  daysOverdue: (a, b) => a.daysOverdue - b.daysOverdue,
};
const SORT_DESC_KEYS = new Set(["balance", "daysOverdue"]);

/** Point-in-time snapshot ("outstanding as of today") — the date range filters which invoices
 *  (by invoiceDate) feed the list, not the "days overdue" math, which stays as-of-now. Mirrors
 *  /reports/payables/aging-details for bills, one row per customer-facing receivable instead. */
export default function ArAgingDetailsPage() {
  const { data: invoices, isLoading } = useSalesInvoices();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [customerMobile, setCustomerMobile] = useState("all");

  const customerOptions = useMemo(() => {
    const byMobile = new Map<string, string>();
    (invoices || [])
      .filter((inv) => inv.balance > 0)
      .forEach((inv) => byMobile.set(inv.customerMobile, inv.customerName || inv.customerMobile));
    return Array.from(byMobile.entries())
      .map(([mobile, name]) => ({ mobile, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices]);

  const rows = useMemo(() => {
    return (invoices || [])
      .filter(
        (inv) =>
          inv.balance > 0 &&
          inv.docStatus !== "draft" &&
          isWithinDateRange(inv.invoiceDate, range) &&
          (customerMobile === "all" || inv.customerMobile === customerMobile)
      )
      .map((inv) => ({ ...inv, daysOverdue: inv.dueDate ? Math.max(0, -daysLeft(inv.dueDate)) : 0 }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [invoices, range, customerMobile]);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<AgingDetailRow>("ar-aging-details", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  const totalBalance = rows.reduce((s, inv) => s + inv.balance, 0);

  return (
    <ReportShell
      title="AR Aging Details"
      description="Every outstanding invoice, ranked by how overdue it is."
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((inv) => ({
            Invoice: inv.invoiceNumber,
            Customer: inv.customerName,
            "Due Date": inv.dueDate || "",
            Balance: inv.balance,
            "Days Overdue": inv.daysOverdue,
          }))}
          filename="ar-aging-details"
          title="AR Aging Details"
          summaryLines={[`Invoices: ${rows.length}`, `Total balance: ${inr(totalBalance)}`]}
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
        category={
          <Select value={customerMobile} onValueChange={(v) => v && setCustomerMobile(v)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue>{customerMobile === "all" ? "All Customers" : customerOptions.find((c) => c.mobile === customerMobile)?.name || "Unknown customer"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customerOptions.map((c) => (
                <SelectItem key={c.mobile} value={c.mobile}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptDuotoneIcon} title="No outstanding invoices" description="Everything is paid up." />
      ) : (
        <>
        <MobileRecordList>
          <MobileRecordCard className="bg-muted/40">
            <MobileRecordHeader boldTitle title="Total" value={inr(totalBalance)} showChevron={false} valueClassName="text-red-600 dark:text-red-400" />
          </MobileRecordCard>
          {sortedRows.map((inv) => (
            <MobileRecordCard key={inv.id} href={`/sales/invoices/${inv.id}`}>
              <MobileRecordHeader
                boldTitle title={inv.invoiceNumber}
                subtitle={inv.customerName}
                value={inr(inv.balance)} valueClassName="text-red-600 dark:text-red-400"
              />
              <MobileRecordRow label="Due Date" value={inv.dueDate ? fmtDate(inv.dueDate) : "—"} />
              <MobileRecordRow
                label="Days Overdue"
                value={inv.daysOverdue > 0 ? `${inv.daysOverdue}d` : "Not due"}
                valueClassName={inv.daysOverdue > 0 ? "text-red-600 dark:text-red-400" : undefined}
              />
            </MobileRecordCard>
          ))}
        </MobileRecordList>
        <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th sortKey="invoice" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Invoice</Th>
              <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
              <Th sortKey="dueDate" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Due Date</Th>
              <Th align="right" sortKey="balance" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Balance</Th>
              <Th align="right" sortKey="daysOverdue" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Days Overdue</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td colSpan={3}>Total</Td>
              <Td align="right">{inr(totalBalance)}</Td>
              <Td align="right">—</Td>
            </ReportTotalsRow>
            {sortedRows.map((inv) => (
              <tr key={inv.id} className="hover:bg-muted/30">
                <Td className="font-medium">
                  <Link href={`/sales/invoices/${inv.id}`} className="text-primary hover:underline">
                    {inv.invoiceNumber}
                  </Link>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    {inv.customerName}
                    <CustomerLink mobile={inv.customerMobile} label={inv.customerName} />
                  </span>
                </Td>
                <Td className="text-muted-foreground">{inv.dueDate ? fmtDate(inv.dueDate) : "—"}</Td>
                <Td align="right">{inr(inv.balance)}</Td>
                <Td align="right">
                  {inv.daysOverdue > 0 ? <span className="font-medium text-red-600 dark:text-red-400">{inv.daysOverdue}d</span> : "Not due"}
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
