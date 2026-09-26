"use client";

import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useVendors } from "@/hooks/use-vendors";
import { daysLeft } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";

const BANDS = [
  { key: "current", label: "Not yet due" },
  { key: "d30", label: "1–30 days overdue" },
  { key: "d60", label: "31–60 days overdue" },
  { key: "d90plus", label: "60+ days overdue" },
] as const;

type BandKey = (typeof BANDS)[number]["key"];

function bandOf(daysOverdue: number): BandKey {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  return "d90plus";
}

export default function ApAgingSummaryPage() {
  const { data: bills, isLoading: l1 } = usePurchaseBills();
  const { data: vendors, isLoading: l2 } = useVendors();
  const isLoading = l1 || l2;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [vendorId, setVendorId] = useState("all");

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);

  const vendorOptions = useMemo(() => {
    const ids = new Set((bills || []).filter((b) => b.balance > 0).map((b) => b.vendorId));
    return Array.from(ids)
      .map((id) => ({ id, name: vendorNameById.get(id) || "Unknown vendor" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bills, vendorNameById]);

  const buckets = useMemo(() => {
    const map = new Map<BandKey, { count: number; total: number }>(BANDS.map((b) => [b.key, { count: 0, total: 0 }]));
    (bills || [])
      .filter((b) => b.balance > 0 && isWithinDateRange(b.billDate, range) && (vendorId === "all" || b.vendorId === vendorId))
      .forEach((b) => {
        const daysOverdue = b.dueDate ? Math.max(0, -daysLeft(b.dueDate)) : 0;
        const band = map.get(bandOf(daysOverdue))!;
        band.count += 1;
        band.total += b.balance;
      });
    return map;
  }, [bills, range, vendorId]);

  const totalPayable = useMemo(() => Array.from(buckets.values()).reduce((s, b) => s + b.total, 0), [buckets]);

  const bandRows = useMemo(
    () =>
      BANDS.map((b) => {
        const bucket = buckets.get(b.key)!;
        return { key: b.key, label: b.label, count: bucket.count, total: bucket.total, pct: totalPayable > 0 ? (bucket.total / totalPayable) * 100 : 0 };
      }),
    [buckets, totalPayable]
  );
  type BandRow = (typeof bandRows)[number];
  const SORT_COMPARATORS: Record<string, (a: BandRow, b: BandRow) => number> = {
    band: (a, b) => a.label.localeCompare(b.label),
    bills: (a, b) => a.count - b.count,
    amount: (a, b) => a.total - b.total,
    pct: (a, b) => a.pct - b.pct,
  };
  const SORT_DESC_KEYS = new Set(["bills", "amount", "pct"]);
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<BandRow>("ap-aging-summary", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedBandRows = applySort(bandRows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="AP Aging Summary"
      description="Outstanding payables grouped by how overdue they are."
      actions={
        <ReportActionsMenu
          rows={sortedBandRows.map((b) => ({ Band: b.label, Bills: b.count, Amount: b.total }))}
          filename="ap-aging-summary"
          title="AP Aging Summary"
          summaryLines={[`Total payable: ${inr(totalPayable)}`]}
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
          <Select value={vendorId} onValueChange={(v) => v && setVendorId(v)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue>{vendorId === "all" ? "All Vendors" : vendorNameById.get(vendorId) || "Unknown vendor"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendorOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Payable" value={inr(totalPayable)} icon={Wallet} tone={totalPayable > 0 ? "warning" : "default"} />
      </div>

      {totalPayable === 0 ? (
        <EmptyState icon={Wallet} title="No outstanding bills" description="Everything is paid up." />
      ) : (
        <>
        <MobileRecordList>
          <MobileRecordCard className="bg-muted/40">
            <MobileRecordHeader title="Total" value={inr(totalPayable)} showChevron={false} />
            <MobileRecordRow label="Bills" value={Array.from(buckets.values()).reduce((s, b) => s + b.count, 0)} />
            <MobileRecordRow label="% of Payable" value="100%" />
          </MobileRecordCard>
          {sortedBandRows.map((b) => (
            <MobileRecordCard key={b.key}>
              <MobileRecordHeader
                title={b.label}
                value={inr(b.total)}
                valueClassName={b.key !== "current" && b.total > 0 ? "text-red-600 dark:text-red-400" : undefined}
                showChevron={false}
              />
              <MobileRecordRow label="Bills" value={b.count} />
              <MobileRecordRow label="% of Payable" value={`${b.pct.toFixed(1)}%`} />
            </MobileRecordCard>
          ))}
        </MobileRecordList>
        <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th sortKey="band" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Aging band</Th>
              <Th align="right" sortKey="bills" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Bills</Th>
              <Th align="right" sortKey="amount" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Amount</Th>
              <Th align="right" sortKey="pct" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>% of Payable</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td>Total</Td>
              <Td align="right">{Array.from(buckets.values()).reduce((s, b) => s + b.count, 0)}</Td>
              <Td align="right">{inr(totalPayable)}</Td>
              <Td align="right">100%</Td>
            </ReportTotalsRow>
            {sortedBandRows.map((b) => (
              <tr key={b.key} className="hover:bg-muted/30">
                <Td className="font-medium">{b.label}</Td>
                <Td align="right">{b.count}</Td>
                <Td align="right" className={b.key !== "current" && b.total > 0 ? "text-red-600 dark:text-red-400" : undefined}>
                  {inr(b.total)}
                </Td>
                <Td align="right" className="text-muted-foreground">{b.pct.toFixed(1)}%</Td>
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
