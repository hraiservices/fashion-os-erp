import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";
import { STAGE_META, type Stage } from "@/lib/business-rules";
import type { Garment } from "@/lib/types";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Read-only order lookup for the check-in PIN session — a tailor who finds the full app
 * confusing can type a customer's name/mobile here and see just what he needs to stitch the
 * garment (type/lining/qty, measurements, delivery date, stage, special instructions, photos),
 * nothing else. Deliberately reuses the attendance PIN trust boundary rather than adding a
 * second login, per the owner's explicit call — see the "same login as check-in" decision.
 * No amounts/payments/customer balance ever appear here, and there is no write path at all.
 */

const MAX_RESULTS = 15;

interface LookupGarment {
  type: string;
  lining?: string;
  no: number;
}

interface LookupOrder {
  id: string;
  name: string;
  mobile: string;
  deliveryDate: string;
  stage: string;
  stageEmoji: string;
  tailorName: string;
  special: string;
  garments: LookupGarment[];
  measurements: Record<string, string>;
  images: string[];
}

function stageLabel(status: string): { label: string; emoji: string } {
  const meta = STAGE_META[status as Stage];
  return meta ? { label: meta.label, emoji: meta.emoji } : { label: status, emoji: "" };
}

export async function GET(request: Request) {
  const employeeId = await getAttendanceEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance is not configured" }, { status: 503 });

  const { data: employee } = await supabase.from("employees").select("id, active").eq("id", employeeId).maybeSingle();
  if (!employee || !employee.active) return NextResponse.json({ error: "Employee not found or inactive" }, { status: 404 });

  const rawQ = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (rawQ.length < 2) return NextResponse.json({ orders: [] });
  // PostgREST's .or() filter string treats ",()" as grammar, and ILIKE treats "%_" as wildcards —
  // strip/escape both so a customer name/mobile containing any of them can't break the filter
  // (400 error) or turn into an unintended wildcard search.
  const q = rawQ.replace(/[,()]/g, "").replace(/[%_]/g, "\\$&");
  if (q.length < 2) return NextResponse.json({ orders: [] });

  const { data: rows, error } = await supabase
    .from("orders")
    .select("id, name, mobile, delivery_date, status, special, garments, measurements, images, tailor")
    .or(`name.ilike.%${q}%,mobile.ilike.%${q}%`)
    .order("delivery_date", { ascending: true })
    .limit(MAX_RESULTS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tailorIds = Array.from(new Set((rows || []).map((r) => r.tailor).filter(Boolean)));
  const tailorNameById = new Map<string, string>();
  if (tailorIds.length > 0) {
    const { data: tailors } = await supabase.from("employees").select("id, name").in("id", tailorIds);
    for (const t of tailors || []) tailorNameById.set(t.id, t.name);
  }

  const orders: LookupOrder[] = (rows || []).map((r) => {
    const { label, emoji } = stageLabel(r.status || "received");
    const garments = (Array.isArray(r.garments) ? r.garments : []) as unknown as Garment[];
    const measurements = (r.measurements || {}) as Record<string, Json>;
    return {
      id: r.id,
      name: r.name || "",
      mobile: r.mobile || "",
      deliveryDate: r.delivery_date || "",
      stage: label,
      stageEmoji: emoji,
      tailorName: r.tailor ? tailorNameById.get(r.tailor) || "" : "",
      special: r.special || "",
      garments: garments.map((g) => ({ type: g.type, lining: g.lining, no: g.no || 1 })),
      measurements: Object.fromEntries(Object.entries(measurements).filter(([, v]) => v != null && String(v).trim() !== "").map(([k, v]) => [k, String(v)])),
      images: Array.isArray(r.images) ? r.images : [],
    };
  });

  return NextResponse.json({ orders });
}
