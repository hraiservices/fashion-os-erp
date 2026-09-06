"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useVendors } from "@/hooks/use-vendors";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

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

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Payable Details"
      description="Every bill with an outstanding balance, ranked by amount owed."
      actions={
        rows.length > 0 && (
          <ExportMenu
            rows={rows.map((b) => ({ Bill: b.billNumber, Vendor: vendorNameById.get(b.vendorId) || "", "Bill Date": b.billDate, "Due Date": b.dueDate || "", Total: b.total, Balance: b.balance }))}
            filename="payable_details"
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
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Bill</Th>
              <Th>Vendor</Th>
              <Th>Bill Date</Th>
              <Th>Due Date</Th>
              <Th align="right">Total</Th>
              <Th align="right">Balance</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((b) => (
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
      )}
    </ReportShell>
  );
}
