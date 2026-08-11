"use client";

import { useMemo } from "react";
import { Package } from "lucide-react";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { inr } from "@/lib/format";
import { purchaseItemId, purchaseItemName } from "@/lib/purchases";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function PurchaseOrderByItemPage() {
  const { data: orders, isLoading } = usePurchaseOrders();

  const rows = useMemo(() => {
    const map = new Map<string, { itemName: string; unitName: string; qty: number; amount: number; poCount: number }>();
    (orders || []).forEach((po) => {
      po.items.forEach((item) => {
        const id = purchaseItemId(item);
        if (!id) return;
        const row = map.get(id) || { itemName: purchaseItemName(item), unitName: item.unitName, qty: 0, amount: 0, poCount: 0 };
        row.qty += item.qty;
        row.amount += item.amount;
        row.poCount += 1;
        map.set(id, row);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [orders]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Purchase Order By Item"
      description="Quantity and value ordered per item, across every purchase order."
      actions={
        rows.length > 0 && (
          <ExportMenu
            rows={rows.map((r) => ({ Item: r.itemName, Unit: r.unitName, "Qty Ordered": r.qty, "Purchase Orders": r.poCount, "Total Value": r.amount }))}
            filename="po_by_item"
          />
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={Package} title="No purchase orders yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Item</Th>
              <Th align="right">Qty Ordered</Th>
              <Th align="right">Purchase Orders</Th>
              <Th align="right">Total Value</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.itemName} className="hover:bg-muted/30">
                <Td className="font-medium">{r.itemName}</Td>
                <Td align="right">
                  {r.qty} {r.unitName}
                </Td>
                <Td align="right">{r.poCount}</Td>
                <Td align="right">{inr(r.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
