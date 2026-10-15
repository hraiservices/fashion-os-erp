/**
 * Raw-material tracking for a stitching order — the lining, buttons, thread reels etc. the shop buys for it.
 * `materials` lists only the items this order NEEDS; each is either still awaited or received. An order with no
 * items is "untracked" (every order from before this existed, and orders that need no bought material).
 */
import type { Order } from "@/lib/types";

export type MaterialKey = "lining" | "buttons" | "reels" | "other";

export interface MaterialItem {
  key: MaterialKey;
  /** Shown name — the preset label, or whatever the shop typed for "other". */
  label: string;
  received: boolean;
  /** ISO time it was marked received (absent while awaited). */
  at?: string;
}

export const MATERIAL_PRESETS: { key: MaterialKey; label: string }[] = [
  { key: "lining", label: "Lining" },
  { key: "buttons", label: "Buttons" },
  { key: "reels", label: "Reels" },
  { key: "other", label: "Other" },
];

export type MaterialStatus = "untracked" | "waiting" | "partial" | "complete";

/** Tolerant parse of the jsonb column — drops anything malformed rather than throwing on a bad row. */
export function parseMaterials(raw: unknown): MaterialItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MaterialItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const preset = MATERIAL_PRESETS.find((p) => p.key === o.key);
    if (!preset) continue;
    const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : preset.label;
    out.push({ key: preset.key, label, received: o.received === true, ...(typeof o.at === "string" && o.at ? { at: o.at } : {}) });
  }
  return out;
}

export function materialStatus(items: MaterialItem[]): MaterialStatus {
  if (items.length === 0) return "untracked";
  const got = items.filter((i) => i.received).length;
  return got === items.length ? "complete" : got === 0 ? "waiting" : "partial";
}

export function materialCounts(items: MaterialItem[]): { received: number; total: number } {
  return { received: items.filter((i) => i.received).length, total: items.length };
}

/** Names of the items still awaited, e.g. "Lining, Buttons". */
export function missingMaterials(items: MaterialItem[]): string {
  return items.filter((i) => !i.received).map((i) => i.label).join(", ");
}

/** Short badge text for lists and boards. */
export function materialBadgeLabel(items: MaterialItem[]): string {
  const s = materialStatus(items);
  if (s === "untracked") return "";
  if (s === "complete") return "Material in";
  const { received, total } = materialCounts(items);
  return s === "waiting" ? "No material" : `Material ${received}/${total}`;
}

/** Whether a tailor can start this order today: it hasn't been started (still "received") and any tracked material
 *  has all arrived. Orders that track no material are not treated as blocked, but are reported separately. */
export function isWorkAvailable(order: Pick<Order, "status" | "materials" | "orderType">): boolean {
  return order.status === "received" && materialStatus(order.materials) === "complete";
}

/** Validates/normalises items coming from a form or API body: known keys only, one entry per preset (several allowed
 *  for "other"), labels trimmed, `at` stamped when an item is newly received and keeps its earlier time otherwise. */
export function normalizeMaterials(next: unknown, previous: MaterialItem[] = [], nowIso: string = new Date().toISOString()): MaterialItem[] {
  const items = parseMaterials(next);
  const seen = new Set<string>();
  const out: MaterialItem[] = [];
  for (const it of items) {
    const id = it.key === "other" ? `other:${it.label.toLowerCase()}` : it.key;
    if (seen.has(id)) continue;
    seen.add(id);
    const prev = previous.find((p) => p.key === it.key && (it.key !== "other" || p.label.toLowerCase() === it.label.toLowerCase()));
    out.push({
      key: it.key,
      label: it.label,
      received: it.received,
      ...(it.received ? { at: it.at ?? (prev?.received ? prev.at : undefined) ?? nowIso } : {}),
    });
  }
  return out;
}

/** Whole days since an order was received without its material — for "waiting N days". Falls back to 0. */
export function daysWaiting(inDate: string, today: Date = new Date()): number {
  const d = new Date(inDate);
  if (Number.isNaN(d.getTime())) return 0;
  const ms = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export interface AvailabilityRow {
  order: Order;
  tailor: string;
  missing: string;
  /** Whole days since the order was received — how long it has been waiting. */
  days: number;
}

export interface MaterialAvailability {
  /** Received stage, every material in: a tailor can start these today. Earliest delivery first. */
  ready: AvailabilityRow[];
  /** Not started or in progress, with material still awaited. Longest-waiting first. */
  waiting: AvailabilityRow[];
  /** Received stage, but no material recorded either way — worth a look. */
  unrecorded: AvailabilityRow[];
}

const PRE_READY = new Set(["received", "cutting", "stitching", "finishing"]);

/** Splits live orders into "can start now", "waiting for material" and "material not recorded". Alterations are only
 *  listed when they track material; a plain stitching order with nothing recorded lands in `unrecorded`. */
export function buildMaterialAvailability(orders: Order[], tailorLabel: (o: Order) => string, today: Date = new Date()): MaterialAvailability {
  const ready: AvailabilityRow[] = [];
  const waiting: AvailabilityRow[] = [];
  const unrecorded: AvailabilityRow[] = [];
  for (const order of orders) {
    if (!PRE_READY.has(order.status)) continue;
    const status = materialStatus(order.materials);
    const row: AvailabilityRow = { order, tailor: tailorLabel(order) || "Unassigned", missing: missingMaterials(order.materials), days: daysWaiting(order.inDate, today) };
    if (status === "complete") {
      if (order.status === "received") ready.push(row);
    } else if (status === "untracked") {
      if (order.status === "received" && order.orderType === "new") unrecorded.push(row);
    } else {
      waiting.push(row);
    }
  }
  const byDelivery = (a: AvailabilityRow, b: AvailabilityRow) => (a.order.deliveryDate || "9999").localeCompare(b.order.deliveryDate || "9999");
  ready.sort(byDelivery);
  unrecorded.sort(byDelivery);
  waiting.sort((a, b) => b.days - a.days || byDelivery(a, b));
  return { ready, waiting, unrecorded };
}
