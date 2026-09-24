import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { istDayBoundsUtc } from "@/lib/ist-date";
import { STAGE_META, type Stage } from "@/lib/business-rules";
import { displayNameFromEmail } from "@/lib/day-book";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAGE_CHANGE_RE = /Stage changed: (.+?) → (.+?) for (.+)$/;

const STAGE_BY_LABEL: Record<string, Stage> = Object.fromEntries(
  (Object.keys(STAGE_META) as Stage[]).map((s) => [STAGE_META[s].label, s])
);

interface ActivityRow {
  id: number;
  user_email: string | null;
  user_name: string | null;
  action: string;
  order_id: string;
  created_at: string;
}

/**
 * "How long does each stage change actually take, and who made it?" — every stage-change
 * activity_log line, turned into a duration by comparing it against whatever came immediately
 * before it for that SAME order (the previous stage change, or the order's own creation for the
 * very first one) — never against calendar-day boundaries, so an order that sits overnight
 * between two stage changes still reports its real elapsed time.
 *
 * Durations are computed from each order's FULL stage-change history, not just the rows that
 * fall inside the requested date range — otherwise the first in-range change for any order would
 * either be missing its duration or (worse) measure it against the wrong prior event. Only the
 * final, duration-annotated rows are then filtered down to the requested range for display.
 */
export async function GET(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.viewReports) return NextResponse.json({ error: "No permission to view reports" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  if (from && !DATE_RE.test(from)) return NextResponse.json({ error: "Invalid 'from' date" }, { status: 400 });
  if (to && !DATE_RE.test(to)) return NextResponse.json({ error: "Invalid 'to' date" }, { status: 400 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  // Step 1: which orders had a stage change in the requested window at all.
  let inRangeQuery = db
    .from("activity_log")
    .select("id, user_email, user_name, action, order_id, created_at")
    .ilike("action", "%Stage changed:%")
    .not("order_id", "is", null);
  if (from) inRangeQuery = inRangeQuery.gte("created_at", istDayBoundsUtc(from).startUtc);
  if (to) inRangeQuery = inRangeQuery.lt("created_at", istDayBoundsUtc(to).endUtc);
  const { data: inRangeRows, error: inRangeError } = await inRangeQuery;
  if (inRangeError) return NextResponse.json({ error: inRangeError.message }, { status: 500 });

  const orderIds = Array.from(new Set((inRangeRows || []).map((r) => r.order_id as string)));
  if (orderIds.length === 0) return NextResponse.json({ rows: [], byStage: [], byEmployee: [], summary: { count: 0, avgMinutes: 0 } });

  // Step 2: those orders' FULL stage-change history (unbounded by date) plus their creation time.
  const [{ data: fullHistoryRows, error: historyError }, { data: orderRows, error: orderError }, { data: employeeRows }] = await Promise.all([
    db.from("activity_log").select("id, user_email, user_name, action, order_id, created_at").ilike("action", "%Stage changed:%").in("order_id", orderIds),
    db.from("orders").select("id, name, created_at").in("id", orderIds),
    db.from("employees").select("id, name"),
  ]);
  if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 });
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  const employeeNameById = new Map((employeeRows || []).map((e) => [e.id, e.name]));
  const orderById = new Map((orderRows || []).map((o) => [o.id, o]));
  const inRangeIds = new Set((inRangeRows || []).map((r) => r.id));

  const byOrder = new Map<string, ActivityRow[]>();
  for (const r of (fullHistoryRows || []) as ActivityRow[]) {
    const list = byOrder.get(r.order_id) || [];
    list.push(r);
    byOrder.set(r.order_id, list);
  }

  interface OutRow {
    id: number;
    orderId: string;
    customerName: string;
    fromStage: Stage | null;
    fromLabel: string;
    toStage: Stage | null;
    toLabel: string;
    changedAt: string;
    durationMinutes: number | null;
    userEmail: string | null;
    userName: string;
  }
  const rows: OutRow[] = [];

  for (const [orderId, history] of byOrder) {
    const sorted = [...history].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const order = orderById.get(orderId);
    let prevTime = order?.created_at || null;

    for (const r of sorted) {
      const m = r.action.match(STAGE_CHANGE_RE);
      const fromLabel = m?.[1] || "";
      const toLabel = m?.[2] || "";
      const customerName = m?.[3] || order?.name || "";
      const changedAt = r.created_at;
      const durationMinutes = prevTime ? Math.round((new Date(changedAt).getTime() - new Date(prevTime).getTime()) / 60_000) : null;
      prevTime = changedAt;

      if (!inRangeIds.has(r.id)) continue;
      rows.push({
        id: r.id,
        orderId,
        customerName,
        fromStage: STAGE_BY_LABEL[fromLabel] ?? null,
        fromLabel,
        toStage: STAGE_BY_LABEL[toLabel] ?? null,
        toLabel,
        changedAt,
        durationMinutes: durationMinutes != null && durationMinutes >= 0 ? durationMinutes : null,
        userEmail: r.user_email,
        userName: displayNameFromEmail(r.user_email, employeeNameById),
      });
    }
  }

  rows.sort((a, b) => b.changedAt.localeCompare(a.changedAt));

  const timedRows = rows.filter((r) => r.durationMinutes != null) as (OutRow & { durationMinutes: number })[];

  // "Time spent IN a stage" reads most naturally keyed by the stage being left (fromStage) —
  // the Cutting→Stitching transition's duration IS how long the order sat in Cutting.
  const stageBuckets = new Map<string, { stage: Stage; label: string; totalMinutes: number; count: number }>();
  for (const r of timedRows) {
    if (!r.fromStage) continue;
    const key = r.fromStage;
    const bucket = stageBuckets.get(key) || { stage: r.fromStage, label: STAGE_META[r.fromStage].label, totalMinutes: 0, count: 0 };
    bucket.totalMinutes += r.durationMinutes;
    bucket.count += 1;
    stageBuckets.set(key, bucket);
  }
  const byStage = Array.from(stageBuckets.values())
    .map((b) => ({ stage: b.stage, label: b.label, avgMinutes: Math.round(b.totalMinutes / b.count), count: b.count }))
    .sort((a, b) => b.avgMinutes - a.avgMinutes);

  const employeeBuckets = new Map<string, { email: string | null; name: string; totalMinutes: number; count: number }>();
  for (const r of timedRows) {
    const key = r.userEmail || r.userName;
    const bucket = employeeBuckets.get(key) || { email: r.userEmail, name: r.userName, totalMinutes: 0, count: 0 };
    bucket.totalMinutes += r.durationMinutes;
    bucket.count += 1;
    employeeBuckets.set(key, bucket);
  }
  const byEmployee = Array.from(employeeBuckets.values())
    .map((b) => ({ email: b.email, name: b.name, avgMinutes: Math.round(b.totalMinutes / b.count), count: b.count }))
    .sort((a, b) => a.avgMinutes - b.avgMinutes);

  const summary = {
    count: timedRows.length,
    avgMinutes: timedRows.length > 0 ? Math.round(timedRows.reduce((s, r) => s + r.durationMinutes, 0) / timedRows.length) : 0,
  };

  return NextResponse.json({ rows, byStage, byEmployee, summary });
}
