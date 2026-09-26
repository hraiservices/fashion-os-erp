"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useVendors } from "@/hooks/use-vendors";
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

type Bill = NonNullable<ReturnType<typeof usePurchaseBills>["data"]>[number];

/** Every bill that still owes money, ranked by balance — the raw payable list (see AP Aging Details for the same bills ranked by overdue days instead). */
export default function PayableDetailsPage() {
  const { data: bills, isLoading: l1 } = usePurchaseBills();
  const { data: vendors, isLoading: l2 } = useVendors();
  const isLoading = l1 || l2;
  const [vendorId, setVendorId] = useState("all");
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);

  const rows = useMemo(
    () =>
      (bills || [])
        .filter((b) => b.balance > 0 && isWithinDateRange(b.billDate, range))
        .filter((b) => vendorId === "all" || b.vendorId === vendorId)
        .sort((a, b) => b.balance - a.balance),
    [bills, range, vendorId]
  );

  const SORT_COMPARATORS: Record<string, (a: Bill, b: Bill) => number> = {
    bill: (a, b) => a.billNumber.localeCompare(b.billNumber),
    vendor: (a, b) => (vendorNameById.get(a.vendorId) || "").localeCompare(vendorNameById.get(b.vendorId) || ""),
    billDate: (a, b) => a.billDate.localeCompare(b.billDate),
    dueDate: (a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""),
    total: (a, b) => a.total - b.total,
    balance: (a, b) => a.balance - b.balance,
  };
  const SORT_DESC_KEYS = new Set(["total", "balance"]);
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<Bill>("payable-details", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Payable Details"
      description="Every bill with an outstanding balance, ranked by amount owed."
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((b) => ({ Bill: b.billNumber, Vendor: vendorNameById.get(b.vendorId) || "", "Bill Date": b.billDate, "Due Date": b.dueDate || "", Total: b.total, Balance: b.balance }))}
          filename="payable-details"
          title="Payable Details"
          summaryLines={[`Bills: ${rows.length}`, `Total balance: ${inr(rows.reduce((s, b) => s + b.balance, 0))}`]}
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
              {(vendors || []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No outstanding bills" description="Everything is paid up." />
      ) : (
        <>
        <MobileRecordList>
          <MobileRecordCard className="bg-muted/40">
            <MobileRecordHeader title="Total" value={inr(rows.reduce((s, b) => s + b.balance, 0))} showChevron={false} />
            <MobileRecordRow label="Total (billed)" value={inr(rows.reduce((s, b) => s + b.total, 0))} />
          </MobileRecordCard>
          {sortedRows.map((b) => (
            <MobileRecordCard key={b.id} href={`/purchases/bills/${b.id}`}>
              <MobileRecordHeader
                title={b.billNumber}
                subtitle={vendorNameById.get(b.vendorId) || "Unknown vendor"}
                value={inr(b.balance)}
              />
              <MobileRecordRow label="Bill Date" value={fmtDate(b.billDate)} />
              <MobileRecordRow label="Due Date" value={b.dueDate ? fmtDate(b.dueDate) : "—"} />
              <MobileRecordRow label="Total" value={inr(b.total)} />
            </MobileRecordCard>
          ))}
        </MobileRecordList>
        <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th sortKey="bill" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Bill</Th>
              <Th sortKey="vendor" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Vendor</Th>
              <Th sortKey="billDate" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Bill Date</Th>
              <Th sortKey="dueDate" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Due Date</Th>
              <Th align="right" sortKey="total" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Total</Th>
              <Th align="right" sortKey="balance" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Balance</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td colSpan={4}>Total</Td>
              <Td align="right">{inr(rows.reduce((s, b) => s + b.total, 0))}</Td>
              <Td align="right">{inr(rows.reduce((s, b) => s + b.balance, 0))}</Td>
            </ReportTotalsRow>
            {sortedRows.map((b) => (
              <tr key={b.id} className="hover:bg-muted/30">
                <Td className="font-medium">
                  <Link href={`/purchases/bills/${b.id}`} className="text-primary hover:underline">
                    {b.billNumber}
                  </Link>
                </Td>
                <Td>{vendorNameById.get(b.vendorId) || "Unknown vendor"}</Td>
                <Td className="text-muted-foreground">{fmtDate(b.billDate)}</Td>
                <Td className="text-muted-foreground">{b.dueDate ? fmtDate(b.dueDate) : "—"}</Td>
                <Td align="right" className="text-muted-foreground">{inr(b.total)}</Td>
                <Td align="right" className="font-medium">{inr(b.balance)}</Td>
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
