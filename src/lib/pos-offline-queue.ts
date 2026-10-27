// Lets a POS sale survive a dropped connection: if completing a sale fails because the network
// itself is down (not because the server rejected it), the sale is queued in localStorage and
// retried automatically once the browser is back online. Safe to retry because every queued
// entry carries the idempotencyKey it was first submitted with — the save-invoice route already
// dedupes on that key (see add_invoice_idempotency_key.sql), so a retry after a flaky "did that
// actually go through?" connection never double-books the sale.
const STORAGE_KEY = "pos-offline-queue";

export interface QueuedSale {
  idempotencyKey: string;
  queuedAt: string;
  /** The exact payload useSaveInvoice expects, minus userEmail (resolved server-side anyway). */
  input: Record<string, unknown>;
  /** For the "N offline sales pending" chip — not re-derived from input to keep this cheap. */
  summaryLabel: string;
}

function read(): QueuedSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedSale[]) : [];
  } catch {
    return [];
  }
}

function write(queue: QueuedSale[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full/unavailable — the sale was already rung up locally (cart cleared, receipt
    // printed); losing the queue entry means it won't auto-sync, but it isn't silently lost
    // twice since nothing else depended on this write succeeding.
  }
}

export function getQueuedSales(): QueuedSale[] {
  return read();
}

export function queueSale(sale: QueuedSale) {
  const queue = read();
  if (queue.some((s) => s.idempotencyKey === sale.idempotencyKey)) return;
  write([...queue, sale]);
}

export function removeQueuedSale(idempotencyKey: string) {
  write(read().filter((s) => s.idempotencyKey !== idempotencyKey));
}

/** A fetch/network failure (connection down, DNS, CORS-from-offline) vs. the server actually
 *  responding with a rejection — only the former belongs in the offline queue. A rejected sale
 *  (bad data, permission denied, insufficient stock) would just fail the exact same way on
 *  every retry and should surface to the cashier immediately instead of silently queuing. */
export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return /fetch|network/i.test(err.message);
  return false;
}
