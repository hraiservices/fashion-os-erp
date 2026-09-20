// Daily Tailor Worksheet — a printable per-tailor "today's work + pending from before" report.
// Reuses the per-garment production checklist (garment-checklist.ts) as the sole source of
// truth for "is this piece done", independent of the order's own stage — a garment counts as
// pending for its assigned tailor until it's marked `pressed`.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isFullyDone } from "@/lib/garment-checklist";
import { istDateString } from "@/lib/ist-date";
import type { Garment } from "@/lib/types";

export interface WorksheetGarment {
  key: string;
  orderId: string;
  customerName: string;
  customerMobile: string;
  garmentType: string;
  lining: string;
  qty: number;
  deliveryDate: string;
}

export interface TailorWorksheetSection {
  tailorId: string;
  tailorName: string;
  /** Delivery date has already passed — the only bucket that gets urgent/warning styling. */
  overdue: WorksheetGarment[];
  /** Already known-pending as of an earlier worksheet run, but not yet actually overdue —
   *  shown calmly, since "known about for a while" isn't the same as "late". */
  pendingFromBefore: WorksheetGarment[];
  newToday: WorksheetGarment[];
}

interface OrderForWorksheet {
  id: string;
  name: string;
  mobile: string;
  deliveryDate: string;
  garments: Garment[];
}

const LINING_LABELS: Record<string, string> = { s: "No Lining", h: "Half Lining", f: "Full Lining" };

/** Stable per-garment key — falls back to positional index for garments predating `lineId`. */
export function garmentKey(orderId: string, garment: Garment, index: number): string {
  return `${orderId}:${garment.lineId ?? index}`;
}

/** Every garment across all orders that isn't fully finished yet (every piece's checklist has
 *  reached "Ready"), grouped by assigned tailor — independent of the order's own stage field. */
export function pendingGarmentsByTailor(orders: OrderForWorksheet[]): Map<string, WorksheetGarment[]> {
  const byTailor = new Map<string, WorksheetGarment[]>();
  for (const order of orders) {
    order.garments.forEach((garment, index) => {
      const tailorId = garment.tailor;
      if (!tailorId) return;
      if (isFullyDone(garment)) return;

      const entry: WorksheetGarment = {
        key: garmentKey(order.id, garment, index),
        orderId: order.id,
        customerName: order.name,
        customerMobile: order.mobile,
        garmentType: garment.type,
        lining: LINING_LABELS[garment.lining as string] ?? (garment.lining ? String(garment.lining) : ""),
        qty: garment.no || 1,
        deliveryDate: order.deliveryDate,
      };
      const list = byTailor.get(tailorId);
      if (list) list.push(entry);
      else byTailor.set(tailorId, [entry]);
    });
  }
  return byTailor;
}

/**
 * The one function both the JSON report route and the PDF route call, so the two can never
 * disagree. Every call upserts today's snapshot (safe to call repeatedly the same day — the
 * unique (snapshot_date, tailor_id) constraint means it just updates), then diffs against the
 * most recent snapshot dated before today to split "carried over" vs "new today".
 */
export async function buildTailorWorksheet(supabase: SupabaseClient<Database>): Promise<TailorWorksheetSection[]> {
  const today = istDateString();

  const [{ data: orderRows }, { data: employeeRows }] = await Promise.all([
    supabase.from("orders").select("id, name, mobile, delivery_date, garments"),
    supabase.from("employees").select("id, name").eq("active", true),
  ]);

  const orders: OrderForWorksheet[] = (orderRows || []).map((r) => ({
    id: r.id,
    name: r.name || "",
    mobile: r.mobile || "",
    deliveryDate: r.delivery_date || "",
    garments: (Array.isArray(r.garments) ? r.garments : []) as unknown as Garment[],
  }));
  const employeeNameById = new Map((employeeRows || []).map((e) => [e.id, e.name]));

  const pendingByTailor = pendingGarmentsByTailor(orders);

  // One query for every tailor's snapshot history before today instead of one query per tailor
  // (this loop previously issued a fresh SELECT per tailor — a real N+1, confirmed by a live
  // performance audit). Reduced to "latest row per tailor" in memory below, since a single
  // tailor's snapshot history is small and Supabase's query builder has no DISTINCT ON support.
  const tailorIds = [...pendingByTailor.keys()];
  const { data: snapshotRows } = tailorIds.length
    ? await supabase
        .from("tailor_worksheet_snapshots")
        .select("tailor_id, snapshot_date, pending_keys")
        .in("tailor_id", tailorIds)
        .lt("snapshot_date", today)
        .order("snapshot_date", { ascending: false })
    : { data: [] as { tailor_id: string; snapshot_date: string; pending_keys: unknown }[] };

  const priorKeysByTailor = new Map<string, Set<string>>();
  for (const row of snapshotRows || []) {
    // Rows arrive most-recent-first per the ORDER above; the first one seen per tailor_id is
    // that tailor's latest snapshot before today, so later rows for the same tailor are skipped.
    if (priorKeysByTailor.has(row.tailor_id)) continue;
    priorKeysByTailor.set(row.tailor_id, new Set((row.pending_keys as string[] | null) || []));
  }

  const sections: TailorWorksheetSection[] = [];
  const snapshotUpserts: { snapshot_date: string; tailor_id: string; pending_keys: string[] }[] = [];

  for (const [tailorId, pending] of pendingByTailor) {
    const priorKeys = priorKeysByTailor.get(tailorId) || new Set<string>();
    // Overdue is judged purely by delivery date, independent of carried-over/new — a garment
    // due days from now shouldn't read as urgent just because it's been pending a while, and
    // one due today/passed should read as urgent even if it's brand new on today's list.
    const overdue = pending.filter((g) => g.deliveryDate && g.deliveryDate < today);
    const notOverdue = pending.filter((g) => !(g.deliveryDate && g.deliveryDate < today));
    const pendingFromBefore = notOverdue.filter((g) => priorKeys.has(g.key));
    const newToday = notOverdue.filter((g) => !priorKeys.has(g.key));

    snapshotUpserts.push({ snapshot_date: today, tailor_id: tailorId, pending_keys: pending.map((g) => g.key) });

    sections.push({
      tailorId,
      tailorName: employeeNameById.get(tailorId) || "Unknown",
      overdue,
      pendingFromBefore,
      newToday,
    });
  }

  if (snapshotUpserts.length) {
    await supabase.from("tailor_worksheet_snapshots").upsert(snapshotUpserts, { onConflict: "snapshot_date,tailor_id" });
  }

  // Most-work-first so the busiest/most-behind tailor's sheet is easy to find at the top.
  sections.sort(
    (a, b) =>
      b.overdue.length + b.pendingFromBefore.length + b.newToday.length - (a.overdue.length + a.pendingFromBefore.length + a.newToday.length)
  );
  return sections;
}
