// Daily Tailor Worksheet — a printable per-tailor "today's work + pending from before" report.
// Reuses the per-garment production checklist (garment-checklist.ts) as the sole source of
// truth for "is this piece done", independent of the order's own stage — a garment counts as
// pending for its assigned tailor until it's marked `pressed`.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getChecklist } from "@/lib/garment-checklist";
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
  carriedOver: WorksheetGarment[];
  newToday: WorksheetGarment[];
}

interface OrderForWorksheet {
  id: string;
  name: string;
  mobile: string;
  deliveryDate: string;
  garments: Garment[];
}

const LINING_LABELS: Record<string, string> = { s: "Simple", h: "Half Lining", f: "Full Lining" };

/** Stable per-garment key — falls back to positional index for garments predating `lineId`,
 *  same fallback preserve_garment_payables() already uses. */
export function garmentKey(orderId: string, garment: Garment, index: number): string {
  return `${orderId}:${garment.lineId ?? index}`;
}

/** Every garment across all orders that isn't fully finished yet (checklist.pressed is not
 *  true), grouped by assigned tailor — independent of the order's own stage field. */
export function pendingGarmentsByTailor(orders: OrderForWorksheet[]): Map<string, WorksheetGarment[]> {
  const byTailor = new Map<string, WorksheetGarment[]>();
  for (const order of orders) {
    order.garments.forEach((garment, index) => {
      const tailorId = garment.tailor;
      if (!tailorId) return;
      if (getChecklist(garment).pressed) return;

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
  const sections: TailorWorksheetSection[] = [];

  for (const [tailorId, pending] of pendingByTailor) {
    const { data: lastSnapshot } = await supabase
      .from("tailor_worksheet_snapshots")
      .select("pending_keys")
      .eq("tailor_id", tailorId)
      .lt("snapshot_date", today)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const priorKeys = new Set((lastSnapshot?.pending_keys as string[] | null) || []);
    const carriedOver = pending.filter((g) => priorKeys.has(g.key));
    const newToday = pending.filter((g) => !priorKeys.has(g.key));

    await supabase.from("tailor_worksheet_snapshots").upsert(
      { snapshot_date: today, tailor_id: tailorId, pending_keys: pending.map((g) => g.key) },
      { onConflict: "snapshot_date,tailor_id" }
    );

    sections.push({
      tailorId,
      tailorName: employeeNameById.get(tailorId) || "Unknown",
      carriedOver,
      newToday,
    });
  }

  // Most-work-first so the busiest/most-behind tailor's sheet is easy to find at the top.
  sections.sort((a, b) => b.carriedOver.length + b.newToday.length - (a.carriedOver.length + a.newToday.length));
  return sections;
}
