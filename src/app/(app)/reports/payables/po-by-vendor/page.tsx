"use client";

import { useMemo } from "react";
import { Truck } from "lucide-react";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { useVendors } from "@/hooks/use-vendors";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

export default function PurchaseOrdersByVendorPage() {
  const { data: orders, isLoading: l1 } = usePurchaseOrders();
  const { data: vendors, isLoading: l2 } = useVendors();
  const isLoading = l1 || l2;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);

  const rows = useMemo(() => {
    const map = new Map<string, { vendorId: string; count: number; total: number }>();
    (orders || []).filter((po) => isWithinDateRange(po.date, range)).forEach((po) => {
      const row = map.get(po.vendorId) || { vendorId: po.vendorId, count: 0, total: 0 };
      row.count += 1;
      row.total += po.total;
      map.set(po.vendorId, row);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Purchase Orders by Vendor"
      description="Purchase order count and value per vendor."
      actions={
        <ReportActionsMenu
          rows={rows.map((r) => ({ Vendor: vendorNameById.get(r.vendorId) || "", "PO Count": r.count, Total: r.total }))}
          filename="po-by-vendor"
          title="Purchase Orders by Vendor"
          summaryLines={[`Vendors: ${rows.length}`, `Total value: ${inr(rows.reduce((s, r) => s + r.total, 0))}`]}
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
      />

      {rows.length === 0 ? (
        <EmptyState icon={Truck} title="No purchase orders yet" />
      ) : (
        <>
        <MobileRecordList>
          <MobileRecordCard className="bg-muted/40">
            <MobileRecordHeader title="Total" value={inr(rows.reduce((s, r) => s + r.total, 0))} showChevron={false} />
            <MobileRecordRow label="Purchase Orders" value={rows.reduce((s, r) => s + r.count, 0)} />
          </MobileRecordCard>
          {rows.map((r) => (
            <MobileRecordCard key={r.vendorId}>
              <MobileRecordHeader title={vendorNameById.get(r.vendorId) || "Unknown vendor"} value={inr(r.total)} showChevron={false} />
              <MobileRecordRow label="Purchase Orders" value={r.count} />
            </MobileRecordCard>
          ))}
        </MobileRecordList>
        <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Vendor</Th>
              <Th align="right">Purchase Orders</Th>
              <Th align="right">Total Value</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td>Total</Td>
              <Td align="right">{rows.reduce((s, r) => s + r.count, 0)}</Td>
              <Td align="right">{inr(rows.reduce((s, r) => s + r.total, 0))}</Td>
            </ReportTotalsRow>
            {rows.map((r) => (
              <tr key={r.vendorId} className="hover:bg-muted/30">
                <Td className="font-medium">{vendorNameById.get(r.vendorId) || "Unknown vendor"}</Td>
                <Td align="right">{r.count}</Td>
                <Td align="right">{inr(r.total)}</Td>
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
