"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Truck, Link2 } from "lucide-react";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useVendors } from "@/hooks/use-vendors";
import { avgDaysToPayVendor } from "@/lib/purchases";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue } from "@/components/ui/money-text";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

export default function VendorBalanceSummaryPage() {
  const { data: bills, isLoading: l1 } = usePurchaseBills();
  const { data: vendors, isLoading: l2 } = useVendors();
  const isLoading = l1 || l2;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);

  const rows = useMemo(() => {
    const billsList = (bills || []).filter((b) => isWithinDateRange(b.billDate, range));
    const map = new Map<string, { vendorId: string; billCount: number; total: number; paid: number; balance: number; bills: typeof billsList }>();
    billsList.forEach((b) => {
      const row = map.get(b.vendorId) || { vendorId: b.vendorId, billCount: 0, total: 0, paid: 0, balance: 0, bills: [] as typeof billsList };
      row.billCount += 1;
      row.total += b.total;
      row.paid += b.paidTotal;
      row.balance += b.balance;
      row.bills.push(b);
      map.set(b.vendorId, row);
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, avgDaysToPay: avgDaysToPayVendor(r.bills) }))
      .sort((a, b) => b.balance - a.balance);
  }, [bills, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Vendor Balance Summary"
      description="Total billed, paid, outstanding balance, and average days to pay per vendor."
      actions={
        rows.length > 0 && (
          <ExportMenu
            rows={rows.map((r) => ({
              Vendor: vendorNameById.get(r.vendorId) || "Unknown",
              Bills: r.billCount,
              Total: r.total,
              Paid: r.paid,
              Balance: r.balance,
              "Avg Days to Pay": r.avgDaysToPay ?? "",
            }))}
            filename="vendor_balance_summary"
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

      {rows.length === 0 ? (
        <EmptyState icon={Truck} title="No purchases yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Vendor</Th>
              <Th align="right">Bills</Th>
              <Th align="right">Total Billed</Th>
              <Th align="right">Paid</Th>
              <Th align="right">Balance</Th>
              <Th align="right">Avg Days to Pay</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.vendorId} className="hover:bg-muted/30">
                <Td className="font-medium">{vendorNameById.get(r.vendorId) || "Unknown vendor"}</Td>
                <Td align="right">{r.billCount}</Td>
                <Td align="right">{inr(r.total)}</Td>
                <Td align="right" className="text-emerald-600 dark:text-emerald-400">{inr(r.paid)}</Td>
                <Td align="right">{r.balance > 0 ? <BalanceDue amount={r.balance} /> : <span className="text-muted-foreground">—</span>}</Td>
                <Td align="right" className="text-muted-foreground">{r.avgDaysToPay != null ? `${r.avgDaysToPay}d` : "—"}</Td>
                <Td align="right">
                  <Link href={`/purchases/vendors/${r.vendorId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Link2 className="size-3" /> Vendor
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
