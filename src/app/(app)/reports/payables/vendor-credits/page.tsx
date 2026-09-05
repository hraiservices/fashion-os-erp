"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileMinus } from "lucide-react";
import { useVendorCredits } from "@/hooks/use-vendor-credits";
import { useVendors } from "@/hooks/use-vendors";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

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

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Vendor Credit Details"
      description="Every credit note issued by a vendor against a purchase bill."
      actions={
        rows.length > 0 && (
          <ExportMenu
            rows={rows.map((c) => ({
              "Credit#": c.creditNumber,
              Date: c.date,
              Vendor: vendorNameById.get(c.vendorId) || "",
              Bill: c.billId ? billById.get(c.billId)?.billNumber || "" : "",
              Amount: c.total,
              Reason: c.reason,
            }))}
            filename="vendor_credit_details"
          />
        )
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
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Credit#</Th>
              <Th>Date</Th>
              <Th>Vendor</Th>
              <Th>Bill</Th>
              <Th>Reason</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((c) => {
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
      )}
    </ReportShell>
  );
}
