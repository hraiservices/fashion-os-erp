// Inventory business logic — Phase 1 (Raw Materials, Products, BOM, Stock Ledger).
// Stock is never a stored/cached column: it is always derived as SUM(movement) from
// inventory_ledger, mirroring the balance-is-always-derived rule for orders.

export type ItemType = "raw_material" | "product";

export type LedgerRefType =
  | "opening"
  | "purchase"
  | "purchase_return"
  | "sale"
  | "sale_return"
  | "work_order_consume"
  | "work_order_produce"
  | "adjustment"
  | "transfer_out"
  | "transfer_in";

export const LEDGER_REF_LABELS: Record<LedgerRefType, string> = {
  opening: "Opening stock",
  purchase: "Purchase received",
  purchase_return: "Purchase return",
  sale: "Sale",
  sale_return: "Sale return",
  work_order_consume: "Manufacturing consumption",
  work_order_produce: "Manufacturing output",
  adjustment: "Manual adjustment",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
};

export interface LedgerRow {
  item_type: string;
  item_id: string;
  stock_qty: number;
}

/** Builds a `${item_type}:${item_id}` -> stock_qty lookup from the inventory_stock view. */
export function buildStockMap(rows: LedgerRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(`${r.item_type}:${r.item_id}`, r.stock_qty);
  return map;
}

export function stockKey(itemType: ItemType, itemId: string): string {
  return `${itemType}:${itemId}`;
}

export function isLowStock(stockQty: number, lowStockAlert: number): boolean {
  return lowStockAlert > 0 && stockQty <= lowStockAlert;
}

export interface ReorderEstimate {
  /** Units consumed per day, averaged over the lookback window. */
  dailyRate: number;
  /** null when consumption is at/near zero — "runs out" has no meaningful date to give. */
  daysUntilEmpty: number | null;
}

/** How many days of ledger history to average consumption over — long enough to smooth out a
 *  single unusually busy/quiet day, short enough to reflect the shop's CURRENT order pace
 *  rather than a stale average from months ago. */
export const REORDER_LOOKBACK_DAYS = 30;

/**
 * Projects how many days of stock remain at the recent consumption pace — "you'll run out of
 * this in ~N days" rather than only a binary low-stock flag. `consumedInWindow` is the total
 * (positive) quantity consumed over the last `REORDER_LOOKBACK_DAYS` days (movement < 0 rows
 * from inventory_ledger, negated) — the caller aggregates that from the ledger since it varies
 * by data source (raw material consumption today, could extend to product sales pace later).
 * Purely a projection of recent pace, not aware of seasonality or upcoming bulk orders.
 */
export function estimateReorder(currentStock: number, consumedInWindow: number, lookbackDays = REORDER_LOOKBACK_DAYS): ReorderEstimate {
  const dailyRate = consumedInWindow / lookbackDays;
  if (dailyRate <= 0) return { dailyRate: 0, daysUntilEmpty: null };
  return { dailyRate, daysUntilEmpty: Math.max(0, Math.floor(currentStock / dailyRate)) };
}

/** Auto-generated Code128-safe barcode for a new product — a 12-digit numeric code (timestamp tail + random), scannable and printable as-is. Stays user-editable for shops with pre-printed codes. */
export function genBarcode(): string {
  const time = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 900 + 100);
  return `${time}${rand}`;
}
