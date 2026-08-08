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
  | "adjustment";

export const LEDGER_REF_LABELS: Record<LedgerRefType, string> = {
  opening: "Opening stock",
  purchase: "Purchase received",
  purchase_return: "Purchase return",
  sale: "Sale",
  sale_return: "Sale return",
  work_order_consume: "Manufacturing consumption",
  work_order_produce: "Manufacturing output",
  adjustment: "Manual adjustment",
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

/** Auto-generated Code128-safe barcode for a new product — a 12-digit numeric code (timestamp tail + random), scannable and printable as-is. Stays user-editable for shops with pre-printed codes. */
export function genBarcode(): string {
  const time = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 900 + 100);
  return `${time}${rand}`;
}
