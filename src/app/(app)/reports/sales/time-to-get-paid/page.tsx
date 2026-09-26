"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { avgDaysToGetPaid } from "@/lib/sales";
import { fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { cn } from "@/lib/utils";
import { useTableSort } from "@/hooks/use-table-sort";

type SpeedBucket = "all" | "fast" | "normal" | "slow";

type TimeToGetPaidRow = { id: string; invoiceNumber: string; customerName: string; customerMobile: string; invoiceDate: string; lastPaymentDate: string; days: number };

const SORT_COMPARATORS: Record<string, (a: TimeToGetPaidRow, b: TimeToGetPaidRow) => number> = {
  invoice: (a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber),
  customer: (a, b) => a.customerName.localeCompare(b.customerName),
  mobile: (a, b) => a.customerMobile.localeCompare(b.customerMobile),
  invoiceDate: (a, b) => a.invoiceDate.localeCompare(b.invoiceDate),
  lastPaymentDate: (a, b) => a.lastPaymentDate.localeCompare(b.lastPaymentDate),
  days: (a, b) => a.days - b.days,
};
const SORT_DESC_KEYS = new Set(["days"]);

const SPEED_BUCKET_OPTIONS: { value: SpeedBucket; label: string }[] = [
  { value: "all", label: "All" },
  { value: "fast", label: "≤7d" },
  { value: "normal", label: "8-30d" },
  { value: "slow", label: ">30d" },
];

function bucketOf(days: number): Exclude<SpeedBucket, "all"> {
  return days <= 7 ? "fast" : days <= 30 ? "normal" : "slow";
}

/** All/≤7d/8-30d/>30d segmented control — same fixed-set shape as SalesTypeFilter, over this
 *  page's own "days to pay" buckets (which already color the table rows). */
function SpeedBucketFilter({ value, onChange }: { value: SpeedBucket; onChange: (v: SpeedBucket) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1" role="group" aria-label="Filter by days to pay">
      {SPEED_BUCKET_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
            value === o.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Only fully-paid invoices have a "time to get paid" — a partial payment means the invoice
 * isn't paid yet, so it isn't counted here (matches the same fully-settled definition used
 * by the Sales Invoices list's "Avg. Days to Get Paid" stat — see lib/sales.ts avgDaysToGetPaid).
 */
export default function TimeToGetPaidPage() {
  const { data: invoices, isLoading } = useSalesInvoices();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [speedBucket, setSpeedBucket] = useState<SpeedBucket>("all");

  const rows = useMemo(() => {
    return (invoices || [])
      .filter((inv) => inv.paymentStatus === "paid" && inv.lastPaymentDate)
      .filter((inv) => isWithinDateRange(inv.invoiceDate, range))
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        customerMobile: inv.customerMobile,
        invoiceDate: inv.invoiceDate,
        lastPaymentDate: inv.lastPaymentDate as string,
        paymentStatus: inv.paymentStatus,
        days: Math.max(0, Math.round((new Date(inv.lastPaymentDate as string).getTime() - new Date(inv.invoiceDate).getTime()) / 86_400_000)),
      }))
      .filter((r) => speedBucket === "all" || bucketOf(r.days) === speedBucket)
      .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
  }, [invoices, range, speedBucket]);

  const avgDays = avgDaysToGetPaid(invoices || []);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<TimeToGetPaidRow>("sales-time-to-get-paid", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Time to Get Paid"
      description="Days between invoice date and the payment that fully settled it."
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((r) => ({ Invoice: r.invoiceNumber, Customer: r.customerName, Mobile: r.customerMobile, "Invoice Date": r.invoiceDate, "Last Payment": r.lastPaymentDate, "Days to Pay": r.days }))}
          filename="time-to-get-paid"
          title="Time to Get Paid"
          summaryLines={[`Invoices: ${rows.length}`, `Avg days to get paid: ${avgDays != null ? `${avgDays}d` : "—"}`]}
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
        category={<SpeedBucketFilter value={speedBucket} onChange={setSpeedBucket} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Avg. Days to Get Paid" value={avgDays != null ? `${avgDays}d` : "—"} icon={Clock} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Clock} title="No fully-paid invoices yet" description="Invoices that have been paid in full will appear here." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="invoice" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Invoice</Th>
                  <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
                  <Th sortKey="mobile" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Mobile</Th>
                  <Th sortKey="invoiceDate" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Invoice Date</Th>
                  <Th sortKey="lastPaymentDate" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Last Payment</Th>
                  <Th align="right" sortKey="days" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Days to Pay</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={5}>Average ({rows.length} invoice{rows.length === 1 ? "" : "s"})</Td>
                  <Td align="right">{avgDays != null ? `${avgDays}d` : "—"}</Td>
                </ReportTotalsRow>
                {sortedRows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <Td className="font-medium">
                      <Link href={`/sales/invoices/${r.id}`} className="text-primary hover:underline">
                        {r.invoiceNumber}
                      </Link>
                    </Td>
                    <Td>{r.customerName}</Td>
                    <Td className="text-muted-foreground">{r.customerMobile}</Td>
                    <Td className="text-muted-foreground">{fmtDate(r.invoiceDate)}</Td>
                    <Td className="text-muted-foreground">{fmtDate(r.lastPaymentDate)}</Td>
                    <Td align="right" className={r.days <= 7 ? "text-emerald-600 dark:text-emerald-400" : r.days <= 30 ? "" : "text-red-600 dark:text-red-400"}>
                      {r.days}d
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title={`Average (${rows.length} invoice${rows.length === 1 ? "" : "s"})`} value={avgDays != null ? `${avgDays}d` : "—"} showChevron={false} />
            </MobileRecordCard>
            {sortedRows.map((r) => (
              <MobileRecordCard key={r.id} href={`/sales/invoices/${r.id}`}>
                <MobileRecordHeader
                  title={r.invoiceNumber}
                  subtitle={r.customerName}
                  value={`${r.days}d`}
                  valueClassName={r.days <= 7 ? "text-emerald-600 dark:text-emerald-400" : r.days <= 30 ? "" : "text-red-600 dark:text-red-400"}
                />
                <MobileRecordRow label="Mobile" value={r.customerMobile} />
                <MobileRecordRow label="Invoice Date" value={fmtDate(r.invoiceDate)} />
                <MobileRecordRow label="Last Payment" value={fmtDate(r.lastPaymentDate)} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
