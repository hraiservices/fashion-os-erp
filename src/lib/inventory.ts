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
  // lookbackDays <= 0 has no meaningful rate to compute (would divide by zero, or by a
  // negative number) — same "no estimate" answer as zero consumption.
  if (lookbackDays <= 0 || consumedInWindow <= 0) return { dailyRate: 0, daysUntilEmpty: null };
  const dailyRate = consumedInWindow / lookbackDays;
  return { dailyRate, daysUntilEmpty: Math.max(0, Math.floor(currentStock / dailyRate)) };
}

/** Auto-generated Code128-safe barcode for a new product — a 12-digit numeric code (timestamp tail + random), scannable and printable as-is. Stays user-editable for shops with pre-printed codes. */
export function genBarcode(): string {
  const time = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 900 + 100);
  return `${time}${rand}`;
}

/** Assumed capital-lock + storage/spoilage-risk cost of unsold stock, per month — see the
 *  Aging Inventory report (reports/inventory/aging). Not configurable per-shop yet; revisit if
 *  that's ever asked for. */
export const HOLDING_COST_RATE_PER_MONTH = 0.02;

export const AGING_BUCKETS = ["0-30 days", "31-60 days", "61-90 days", "90+ days"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function agingBucketFor(ageDays: number): AgingBucket {
  if (ageDays <= 30) return "0-30 days";
  if (ageDays <= 60) return "31-60 days";
  if (ageDays <= 90) return "61-90 days";
  return "90+ days";
}

interface AgingLedgerEntry {
  itemType: ItemType;
  itemId: string;
  movement: number;
  createdAt: string;
}

interface StockBatch {
  qty: number;
  date: string;
}

export interface AgingBatchResult {
  itemType: ItemType;
  itemId: string;
  stockQty: number;
  oldestBatchAgeDays: number;
  batches: StockBatch[];
}

export interface AgingInventoryItem {
  itemType: ItemType;
  itemId: string;
  stockQty: number;
  unitCost: number;
  stockValue: number;
  /** Age, in days, of the oldest batch of currently-unsold stock (FIFO: the longest any unit of
   *  the item's current stock has sat without being sold/consumed). */
  oldestBatchAgeDays: number;
  bucket: AgingBucket;
  /** Holding cost accrued to date across every unsold batch, at HOLDING_COST_RATE_PER_MONTH,
   *  prorated daily and summed per-batch since each batch has aged a different number of days. */
  accruedHoldingLoss: number;
  /** stockValue × monthly rate — this item's loss keeps growing by roughly this much every
   *  additional month it stays unsold ("increasing day by day"). */
  monthlyLossRate: number;
}

/**
 * FIFO-simulates each item's current stock as a queue of stock-in batches (any positive ledger
 * movement — purchase, opening, sale_return, work_order_produce, transfer_in, adjustment-up),
 * consuming the oldest batch first against every negative movement (sale, work_order_consume,
 * transfer_out, adjustment-down). What's left in the queue after replaying the full ledger is
 * the current stock, each portion dated by when it actually entered — that date is the aging
 * clock the Aging Inventory report uses, instead of a single "first ever stocked" date that
 * would overstate age for an item that's been fully sold through and restocked since.
 */
export function computeInventoryAging(ledgerEntries: AgingLedgerEntry[], now = new Date()): AgingBatchResult[] {
  const byItem = new Map<string, AgingLedgerEntry[]>();
  for (const entry of ledgerEntries) {
    const key = stockKey(entry.itemType, entry.itemId);
    const list = byItem.get(key);
    if (list) list.push(entry);
    else byItem.set(key, [entry]);
  }

  const results: AgingBatchResult[] = [];
  for (const [, entries] of byItem) {
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const batches: StockBatch[] = [];
    for (const entry of entries) {
      let remaining = entry.movement;
      if (remaining > 0) {
        batches.push({ qty: remaining, date: entry.createdAt });
        continue;
      }
      remaining = -remaining;
      while (remaining > 0 && batches.length > 0) {
        const oldest = batches[0];
        const consumed = Math.min(oldest.qty, remaining);
        oldest.qty -= consumed;
        remaining -= consumed;
        if (oldest.qty <= 0) batches.shift();
      }
    }
    const liveBatches = batches.filter((b) => b.qty > 0);
    const stockQty = liveBatches.reduce((s, b) => s + b.qty, 0);
    const oldestDate = liveBatches.length > 0 ? liveBatches[0].date : null;
    const oldestBatchAgeDays = oldestDate ? Math.max(0, Math.floor((now.getTime() - new Date(oldestDate).getTime()) / 86400000)) : 0;
    const { itemType, itemId } = entries[0];
    results.push({ itemType, itemId, stockQty, oldestBatchAgeDays, batches: liveBatches });
  }
  return results;
}

/** Attaches unit cost / stock value / holding-loss figures to each FIFO batch result, and
 *  filters out items with no stock currently on hand (nothing aging to report on). Split out
 *  from computeInventoryAging() because unit cost comes from the products/raw_materials tables,
 *  not the ledger. */
export function priceAgingInventory(batchResults: AgingBatchResult[], costByKey: Map<string, number>, now = new Date()): AgingInventoryItem[] {
  return batchResults
    .filter((r) => r.stockQty > 0.0001)
    .map((r) => {
      const unitCost = costByKey.get(stockKey(r.itemType, r.itemId)) || 0;
      const stockValue = r.stockQty * unitCost;
      const accruedHoldingLoss = r.batches.reduce((sum, b) => {
        const ageDays = Math.max(0, (now.getTime() - new Date(b.date).getTime()) / 86400000);
        return sum + b.qty * unitCost * HOLDING_COST_RATE_PER_MONTH * (ageDays / 30);
      }, 0);
      return {
        itemType: r.itemType,
        itemId: r.itemId,
        stockQty: r.stockQty,
        unitCost,
        stockValue,
        oldestBatchAgeDays: r.oldestBatchAgeDays,
        bucket: agingBucketFor(r.oldestBatchAgeDays),
        accruedHoldingLoss,
        monthlyLossRate: stockValue * HOLDING_COST_RATE_PER_MONTH,
      };
    });
}

// ── Sale → vendor-bill traceability ─────────────────────────────────────────────────────────
// For a shop that buys finished products on vendor credit and resells them: "I sold this for
// ₹3200, I owe the vendor some of that, by when?" isn't answerable from products.cost_price
// alone (one averaged figure, no memory of which specific bill supplied which unit). This FIFO-
// replays the SAME product ledger the Aging Inventory report uses, but instead of reporting
// what's left unsold, it reports what each 'sale' ref_type movement actually consumed — which
// purchase bill(s) (possibly more than one, if a sale's quantity spanned two deliveries), at
// that bill's own recorded unit cost, due on that bill's own due date.

/** One purchase bill's worth of a single product line — what priceSaleVendorTrace joins FIFO
 *  batches against to find the vendor/cost/due-date a consumed unit actually came from. */
export interface PurchaseBillProductLine {
  billId: string;
  billNumber: string;
  vendorId: string;
  dueDate: string | null;
  unitCost: number;
}

/** A portion of one sale's quantity traced back to one purchase bill (or `billId: null` when no
 *  purchase batch could be found to attribute it to — e.g. sold before any bill was recorded in
 *  the ledger, or manufactured in-house rather than bought in). */
export interface SaleVendorAllocation {
  billId: string | null;
  billNumber: string | null;
  vendorId: string | null;
  dueDate: string | null;
  qty: number;
  unitCost: number;
  costAmount: number;
}

/** saleRefId -> productId -> its allocations. A sale line's total cost is the sum of its
 *  allocations' costAmount; its vendor payable is grouped by vendorId/dueDate from there. */
export type SaleVendorTrace = Map<string, Map<string, SaleVendorAllocation[]>>;

export function computeSaleVendorTrace(
  ledgerEntries: { itemId: string; movement: number; refType: string; refId: string | null; createdAt: string }[],
  billLinesByProduct: Map<string, PurchaseBillProductLine[]>,
  fallbackUnitCost: Map<string, number>
): SaleVendorTrace {
  const byProduct = new Map<string, typeof ledgerEntries>();
  for (const entry of ledgerEntries) {
    const list = byProduct.get(entry.itemId);
    if (list) list.push(entry);
    else byProduct.set(entry.itemId, [entry]);
  }

  const trace: SaleVendorTrace = new Map();

  for (const [productId, entries] of byProduct) {
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    // Purchase bill lines for this product, oldest first, each consumed at most once — a bill
    // that bought this product twice (two lines) gets two separate batch entries.
    const billLines = [...(billLinesByProduct.get(productId) || [])];
    const batches: { qty: number; billId: string | null; billNumber: string | null; vendorId: string | null; dueDate: string | null; unitCost: number }[] = [];
    let billLineCursor = 0;

    for (const entry of entries) {
      if (entry.movement > 0) {
        if (entry.refType === "purchase" && billLineCursor < billLines.length) {
          const line = billLines[billLineCursor++];
          batches.push({ qty: entry.movement, billId: line.billId, billNumber: line.billNumber, vendorId: line.vendorId, dueDate: line.dueDate, unitCost: line.unitCost });
        } else {
          // Opening stock, a manual adjustment, or manufacturing output — no vendor bill funded
          // this batch. Falls back to the product's own cost_price so it's still priced, just
          // with no vendor/due date to pay.
          batches.push({ qty: entry.movement, billId: null, billNumber: null, vendorId: null, dueDate: null, unitCost: fallbackUnitCost.get(productId) || 0 });
        }
        continue;
      }

      let remaining = -entry.movement;
      const allocations: SaleVendorAllocation[] = [];
      while (remaining > 0 && batches.length > 0) {
        const oldest = batches[0];
        const consumed = Math.min(oldest.qty, remaining);
        allocations.push({
          billId: oldest.billId,
          billNumber: oldest.billNumber,
          vendorId: oldest.vendorId,
          dueDate: oldest.dueDate,
          qty: consumed,
          unitCost: oldest.unitCost,
          costAmount: Math.round(consumed * oldest.unitCost * 100) / 100,
        });
        oldest.qty -= consumed;
        remaining -= consumed;
        if (oldest.qty <= 0) batches.shift();
      }
      // Ran out of batches entirely (stock ledger has more consumption than recorded purchases —
      // shouldn't happen, but an untracked opening balance predating this feature could cause
      // it) — attribute the remainder at the product's fallback cost, no vendor to pay.
      if (remaining > 0) {
        allocations.push({ billId: null, billNumber: null, vendorId: null, dueDate: null, qty: remaining, unitCost: fallbackUnitCost.get(productId) || 0, costAmount: Math.round(remaining * (fallbackUnitCost.get(productId) || 0) * 100) / 100 });
      }

      if (entry.refType === "sale" && entry.refId) {
        let perProduct = trace.get(entry.refId);
        if (!perProduct) {
          perProduct = new Map();
          trace.set(entry.refId, perProduct);
        }
        const existing = perProduct.get(productId) || [];
        perProduct.set(productId, [...existing, ...allocations]);
      }
      // Any other negative movement (adjustment, transfer_out, return, work_order_consume) just
      // drains the FIFO queue silently — it's real consumption, but not a sale to attribute to
      // an invoice.
    }
  }

  return trace;
}
