"use client";

import { useMemo, useState } from "react";
import { Package } from "lucide-react";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { inr } from "@/lib/format";
import { purchaseItemId, purchaseItemName, purchaseItemType, type PurchaseItemType } from "@/lib/purchases";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";

const ITEM_TYPE_LABELS: Record<PurchaseItemType, string> = { raw_material: "Raw Material", product: "Finished Product" };

type ByItemRow = { itemName: string; unitName: string; itemType: PurchaseItemType; qty: number; amount: number; poCount: number };

const SORT_COMPARATORS: Record<string, (a: ByItemRow, b: ByItemRow) => number> = {
  item: (a, b) => a.itemName.localeCompare(b.itemName),
  qty: (a, b) => a.qty - b.qty,
  poCount: (a, b) => a.poCount - b.poCount,
  amount: (a, b) => a.amount - b.amount,
};
const SORT_DESC_KEYS = new Set(["qty", "poCount", "amount"]);

export default function PurchaseOrderByItemPage() {
  const { data: orders, isLoading } = usePurchaseOrders();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  // Items aren't tagged with a free-form category anywhere yet, so raw material vs finished
  // product (the one classification every purchase line already carries) is the best-fit
  // "category" dimension here.
  const [itemType, setItemType] = useState<"all" | PurchaseItemType>("all");

  const rows = useMemo(() => {
    const map = new Map<string, { itemName: string; unitName: string; itemType: PurchaseItemType; qty: number; amount: number; poCount: number }>();
    (orders || []).filter((po) => isWithinDateRange(po.date, range)).forEach((po) => {
      po.items.forEach((item) => {
        const id = purchaseItemId(item);
        if (!id) return;
        if (itemType !== "all" && purchaseItemType(item) !== itemType) return;
        const row = map.get(id) || { itemName: purchaseItemName(item), unitName: item.unitName, itemType: purchaseItemType(item), qty: 0, amount: 0, poCount: 0 };
        row.qty += item.qty;
        row.amount += item.amount;
        row.poCount += 1;
        map.set(id, row);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [orders, range, itemType]);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<ByItemRow>("payables-po-by-item", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Purchase Order By Item"
      description="Quantity and value ordered per item, across every purchase order."
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((r) => ({ Item: r.itemName, Unit: r.unitName, "Qty Ordered": r.qty, "Purchase Orders": r.poCount, "Total Value": r.amount }))}
          filename="po-by-item"
          title="Purchase Order By Item"
          summaryLines={[`Items: ${rows.length}`, `Total value: ${inr(rows.reduce((s, r) => s + r.amount, 0))}`]}
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
          <Select value={itemType} onValueChange={(v) => v && setItemType(v as "all" | PurchaseItemType)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue>{itemType === "all" ? "All Categories" : ITEM_TYPE_LABELS[itemType]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="raw_material">{ITEM_TYPE_LABELS.raw_material}</SelectItem>
              <SelectItem value="product">{ITEM_TYPE_LABELS.product}</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={Package} title="No purchase orders yet" />
      ) : (
        <>
        <MobileRecordList>
          <MobileRecordCard className="bg-muted/40">
            <MobileRecordHeader title="Total" value={inr(rows.reduce((s, r) => s + r.amount, 0))} showChevron={false} />
            <MobileRecordRow label="Qty Ordered" value={rows.reduce((s, r) => s + r.qty, 0)} />
            <MobileRecordRow label="Purchase Orders" value={rows.reduce((s, r) => s + r.poCount, 0)} />
          </MobileRecordCard>
          {sortedRows.map((r) => (
            <MobileRecordCard key={r.itemName}>
              <MobileRecordHeader title={r.itemName} value={inr(r.amount)} showChevron={false} />
              <MobileRecordRow label="Qty Ordered" value={`${r.qty} ${r.unitName}`} />
              <MobileRecordRow label="Purchase Orders" value={r.poCount} />
            </MobileRecordCard>
          ))}
        </MobileRecordList>
        <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th sortKey="item" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Item</Th>
              <Th align="right" sortKey="qty" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Qty Ordered</Th>
              <Th align="right" sortKey="poCount" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Purchase Orders</Th>
              <Th align="right" sortKey="amount" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Total Value</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td>Total</Td>
              <Td align="right">{rows.reduce((s, r) => s + r.qty, 0)}</Td>
              <Td align="right">{rows.reduce((s, r) => s + r.poCount, 0)}</Td>
              <Td align="right">{inr(rows.reduce((s, r) => s + r.amount, 0))}</Td>
            </ReportTotalsRow>
            {sortedRows.map((r) => (
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
        </div>
        </>
      )}
    </ReportShell>
  );
}
