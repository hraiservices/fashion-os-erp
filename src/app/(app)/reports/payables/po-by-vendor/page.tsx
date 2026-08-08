"use client";

import { useMemo } from "react";
import { Truck, Download } from "lucide-react";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { useVendors } from "@/hooks/use-vendors";
import { inr } from "@/lib/format";
import { exportCSV } from "@/lib/export";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function PurchaseOrdersByVendorPage() {
  const { data: orders, isLoading: l1 } = usePurchaseOrders();
  const { data: vendors, isLoading: l2 } = useVendors();
  const isLoading = l1 || l2;

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);

  const rows = useMemo(() => {
    const map = new Map<string, { vendorId: string; count: number; total: number }>();
    (orders || []).forEach((po) => {
      const row = map.get(po.vendorId) || { vendorId: po.vendorId, count: 0, total: 0 };
      row.count += 1;
      row.total += po.total;
      map.set(po.vendorId, row);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [orders]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Purchase Orders by Vendor"
      description="Purchase order count and value per vendor."
      actions={
        rows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCSV(rows.map((r) => ({ Vendor: vendorNameById.get(r.vendorId) || "", "PO Count": r.count, Total: r.total })), "po_by_vendor")}
          >
            <Download className="size-4" /> Export CSV
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={Truck} title="No purchase orders yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Vendor</Th>
              <Th align="right">Purchase Orders</Th>
              <Th align="right">Total Value</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.vendorId} className="hover:bg-muted/30">
                <Td className="font-medium">{vendorNameById.get(r.vendorId) || "Unknown vendor"}</Td>
                <Td align="right">{r.count}</Td>
                <Td align="right">{inr(r.total)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
