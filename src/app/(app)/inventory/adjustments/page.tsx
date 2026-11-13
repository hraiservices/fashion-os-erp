"use client";

import { DateText } from "@/components/ui/date-text";
import { useMemo } from "react";
import { History } from "lucide-react";
import { useInventoryLedger } from "@/hooks/use-inventory-ledger";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { LEDGER_REF_LABELS } from "@/lib/inventory";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { StockAdjustmentForm } from "@/components/inventory/stock-adjustment-form";
import { useTableSort } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { LedgerEntry } from "@/lib/types";

export default function InventoryAdjustmentsPage() {
  const { data: ledgerData, isLoading } = useInventoryLedger();
  const { data: rawMaterials } = useRawMaterials();
  const { data: products } = useProducts();

  const itemNameById = useMemo(() => {
    const map = new Map<string, string>();
    (rawMaterials || []).forEach((m) => map.set(`raw_material:${m.id}`, m.name));
    (products || []).forEach((p) => map.set(`product:${p.id}`, p.name));
    return map;
  }, [rawMaterials, products]);

  // Item name lives on joined raw-material/product data, not the ledger row itself, so this
  // comparator table closes over itemNameById rather than being a fixed module-level table.
  const sortComparators = useMemo<Record<string, (a: LedgerEntry, b: LedgerEntry) => number>>(
    () => ({
      date: (a, b) => a.createdAt.localeCompare(b.createdAt),
      item: (a, b) => (itemNameById.get(`${a.itemType}:${a.itemId}`) || "").localeCompare(itemNameById.get(`${b.itemType}:${b.itemId}`) || ""),
      type: (a, b) => a.refType.localeCompare(b.refType),
      movement: (a, b) => a.movement - b.movement,
    }),
    [itemNameById]
  );
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<LedgerEntry>("inventory-adjustments", sortComparators, new Set(["date", "movement"]));
  const ledger = useMemo(() => (ledgerData ? applySort(ledgerData) : ledgerData), [ledgerData, applySort]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Stock Adjustments" description="Correct stock counts and review the full movement history" />

      <StockAdjustmentForm />

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <History className="size-4" /> Recent stock movements
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !ledger || ledger.length === 0 ? (
          <EmptyState icon={History} title="No stock movements yet" className="border-0" />
        ) : (
          <div className="hidden overflow-hidden rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="date" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Date</SortableTableHead>
                  <SortableTableHead sortKey="item" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Item</SortableTableHead>
                  <SortableTableHead sortKey="type" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Type</SortableTableHead>
                  <SortableTableHead sortKey="movement" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort} align="right">Movement</SortableTableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground"><DateText>{fmtDate(entry.createdAt)}</DateText></TableCell>
                    <TableCell className="font-medium">{itemNameById.get(`${entry.itemType}:${entry.itemId}`) || "Unknown"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{LEDGER_REF_LABELS[entry.refType as keyof typeof LEDGER_REF_LABELS] || entry.refType}</Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${entry.movement > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {entry.movement > 0 ? "+" : ""}
                      {entry.movement}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">{entry.note || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && ledger && ledger.length > 0 && (
          <MobileRecordList>
            {ledger.map((entry) => (
              <MobileRecordCard key={entry.id}>
                <MobileRecordHeader
                  title={itemNameById.get(`${entry.itemType}:${entry.itemId}`) || "Unknown"}
                  subtitle={fmtDate(entry.createdAt)}
                  value={`${entry.movement > 0 ? "+" : ""}${entry.movement}`}
                  valueClassName={entry.movement > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
                  showChevron={false}
                />
                <MobileRecordRow label="Type" value={<Badge variant="secondary">{LEDGER_REF_LABELS[entry.refType as keyof typeof LEDGER_REF_LABELS] || entry.refType}</Badge>} />
                <MobileRecordRow label="Note" value={entry.note || "—"} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        )}
      </div>
    </div>
  );
}
