"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileMinus } from "lucide-react";
import { useVendorCredits } from "@/hooks/use-vendor-credits";
import { useVendors } from "@/hooks/use-vendors";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { inr, fmtDate } from "@/lib/format";
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

type VendorCreditReportRow = {
  id: string;
  creditNumber: string;
  date: string;
  vendorId: string;
  billId?: string | null;
  total: number;
  reason?: string;
};

export default function VendorCreditDetailsPage() {
  const { data: credits, isLoading: l1 } = useVendorCredits();
  const { data: vendors, isLoading: l2 } = useVendors();
  const { data: bills, isLoading: l3 } = usePurchaseBills();
  const isLoading = l1 || l2 || l3;
  const [vendorId, setVendorId] = useState("all");
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);
  const billById = useMemo(() => new Map((bills || []).map((b) => [b.id, b])), [bills]);
  const rows = useMemo(
    () => (credits || []).filter((c) => isWithinDateRange(c.date, range)).filter((c) => vendorId === "all" || c.vendorId === vendorId),
    [credits, range, vendorId],
  );
  const total = useMemo(() => rows.reduce((s, c) => s + c.total, 0), [rows]);

  const sortComparators = useMemo<Record<string, (a: VendorCreditReportRow, b: VendorCreditReportRow) => number>>(
    () => ({
      creditNumber: (a, b) => a.creditNumber.localeCompare(b.creditNumber),
      date: (a, b) => a.date.localeCompare(b.date),
      vendor: (a, b) => (vendorNameById.get(a.vendorId) || "").localeCompare(vendorNameById.get(b.vendorId) || ""),
      bill: (a, b) => (a.billId ? billById.get(a.billId)?.billNumber || "" : "").localeCompare(b.billId ? billById.get(b.billId)?.billNumber || "" : ""),
      reason: (a, b) => (a.reason || "").localeCompare(b.reason || ""),
      total: (a, b) => a.total - b.total,
    }),
    [vendorNameById, billById]
  );
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<VendorCreditReportRow>("vendor-credits", sortComparators, new Set(["total"]));
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Vendor Credit Details"
      description="Every credit note issued by a vendor against a purchase bill."
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((c) => ({
            "Credit#": c.creditNumber,
            Date: c.date,
            Vendor: vendorNameById.get(c.vendorId) || "",
            Bill: c.billId ? billById.get(c.billId)?.billNumber || "" : "",
            Amount: c.total,
            Reason: c.reason,
          }))}
          filename="vendor-credit-details"
          title="Vendor Credit Details"
          summaryLines={[`Credit notes: ${rows.length}`, `Total credited: ${inr(total)}`]}
        />
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Credit Notes" value={rows.length} icon={FileMinus} />
        <StatCard label="Total Credited" value={inr(total)} icon={FileMinus} />
      </div>

      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        resultLabel={`${rows.length} credit${rows.length === 1 ? "" : "s"}`}
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
        <EmptyState icon={FileMinus} title="No vendor credits yet" />
      ) : (
        <>
        <MobileRecordList>
          <MobileRecordCard className="bg-muted/40">
            <MobileRecordHeader title="Total" value={inr(total)} showChevron={false} />
          </MobileRecordCard>
          {sortedRows.map((c) => {
            const bill = c.billId ? billById.get(c.billId) : undefined;
            return (
              <MobileRecordCard key={c.id}>
                <MobileRecordHeader
                  title={c.creditNumber}
                  subtitle={fmtDate(c.date)}
                  value={inr(c.total)}
                  showChevron={false}
                />
                <MobileRecordRow label="Vendor" value={vendorNameById.get(c.vendorId) || "Unknown vendor"} />
                <MobileRecordRow
                  label="Bill"
                  value={
                    bill ? (
                      <Link href={`/purchases/bills/${bill.id}`} className="text-primary hover:underline">
                        {bill.billNumber}
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
                <MobileRecordRow label="Reason" value={c.reason || "—"} />
              </MobileRecordCard>
            );
          })}
        </MobileRecordList>
        <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th sortKey="creditNumber" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Credit#</Th>
              <Th sortKey="date" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Date</Th>
              <Th sortKey="vendor" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Vendor</Th>
              <Th sortKey="bill" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Bill</Th>
              <Th sortKey="reason" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Reason</Th>
              <Th align="right" sortKey="total" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td colSpan={5}>Total</Td>
              <Td align="right">{inr(total)}</Td>
            </ReportTotalsRow>
            {sortedRows.map((c) => {
              const bill = c.billId ? billById.get(c.billId) : undefined;
              return (
                <tr key={c.id} className="hover:bg-muted/30">
                  <Td className="font-medium">{c.creditNumber}</Td>
                  <Td className="text-muted-foreground">{fmtDate(c.date)}</Td>
                  <Td>{vendorNameById.get(c.vendorId) || "Unknown vendor"}</Td>
                  <Td>
                    {bill ? (
                      <Link href={`/purchases/bills/${bill.id}`} className="text-primary hover:underline">
                        {bill.billNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="max-w-40 truncate text-muted-foreground">{c.reason || "—"}</Td>
                  <Td align="right" className="font-medium">{inr(c.total)}</Td>
                </tr>
              );
            })}
          </tbody>
        </ReportTable>
        </div>
        </>
      )}
    </ReportShell>
  );
}
