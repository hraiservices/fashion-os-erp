import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { istDayBoundsUtc } from "@/lib/ist-date";
import { displayNameFromEmail } from "@/lib/day-book";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FLAGGED_RE = /flagged for rework/i;
const CLEARED_RE = /flag cleared/i;

interface ActivityRow {
  id: number;
  user_email: string | null;
  user_name: string | null;
  action: string;
  order_id: string;
  details: string | null;
  created_at: string;
}

/**
 * Every "flagged for rework" activity_log line, one row per instance — not the same as Rework
 * Rate, which only reports an aggregate percentage per tailor. An order flagged 3 times shows up
 * here as 3 rows, each with its own reason, who flagged it, when, and (if it was later cleared)
 * when it was resolved — reconstructed the same way stage-timing reconstructs its detail rows,
 * since rework toggles aren't stored anywhere but activity_log (Order.reworkFlag/reworkReason
 * only ever hold the CURRENT/most-recent flag, not the history).
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

  // Step 1: which orders were flagged for rework at all within the requested window.
  let inRangeQuery = db
    .from("activity_log")
    .select("id, user_email, user_name, action, order_id, details, created_at")
    .ilike("action", "%flagged for rework%")
    .not("order_id", "is", null);
  if (from) inRangeQuery = inRangeQuery.gte("created_at", istDayBoundsUtc(from).startUtc);
  if (to) inRangeQuery = inRangeQuery.lt("created_at", istDayBoundsUtc(to).endUtc);
  const { data: inRangeRows, error: inRangeError } = await inRangeQuery;
  if (inRangeError) return NextResponse.json({ error: inRangeError.message }, { status: 500 });

  const orderIds = Array.from(new Set((inRangeRows || []).map((r) => r.order_id as string)));
  if (orderIds.length === 0) return NextResponse.json({ rows: [] });

  // Step 2: those orders' FULL rework history (unbounded by date) so a flag from before the
  // window can still be correctly paired with a "cleared" event that happens to fall inside it,
  // and vice versa.
  const [{ data: fullHistoryRows, error: historyError }, { data: orderRows, error: orderError }, { data: employeeRows }, { data: userRoleRows }] = await Promise.all([
    db.from("activity_log").select("id, user_email, user_name, action, order_id, details, created_at").ilike("action", "%rework%").in("order_id", orderIds),
    db.from("orders").select("id, name, mobile, tailor, garments").in("id", orderIds),
    db.from("employees").select("id, name"),
    db.from("user_roles").select("email, linked_employee_id").not("linked_employee_id", "is", null),
  ]);
  if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 });
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  const employeeNameById = new Map((employeeRows || []).map((e) => [e.id, e.name]));
  const orderById = new Map((orderRows || []).map((o) => [o.id, o]));
  const inRangeIds = new Set((inRangeRows || []).map((r) => r.id));

  const employeeIdByEmail = new Map((userRoleRows || []).map((r) => [(r.email || "").toLowerCase(), r.linked_employee_id as string]));
  function resolveUserName(email: string | null): string {
    if (email) {
      const empId = employeeIdByEmail.get(email.toLowerCase());
      const name = empId ? employeeNameById.get(empId) : undefined;
      if (name) return name;
    }
    return displayNameFromEmail(email, employeeNameById);
  }

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
    customerMobile: string;
    tailorId: string;
    tailorName: string;
    garmentTypes: string[];
    reason: string;
    flaggedByEmail: string | null;
    flaggedByName: string;
    flaggedAt: string;
    resolvedAt: string | null;
  }
  const rows: OutRow[] = [];

  for (const [orderId, history] of byOrder) {
    const sorted = [...history].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const order = orderById.get(orderId);
    const garmentTypes = Array.isArray(order?.garments) ? (order.garments as { type?: string }[]).map((g) => g.type || "").filter(Boolean) : [];

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      if (!FLAGGED_RE.test(r.action)) continue;
      if (!inRangeIds.has(r.id)) continue;

      // The instance is resolved by whichever "flag cleared" line comes right after it for this
      // same order — a later flag event before any clear means it's still open.
      let resolvedAt: string | null = null;
      for (let j = i + 1; j < sorted.length; j++) {
        if (FLAGGED_RE.test(sorted[j].action)) break;
        if (CLEARED_RE.test(sorted[j].action)) {
          resolvedAt = sorted[j].created_at;
          break;
        }
      }

      rows.push({
        id: r.id,
        orderId,
        customerName: order?.name || "",
        customerMobile: order?.mobile || "",
        tailorId: order?.tailor || "",
        tailorName: order?.tailor ? employeeNameById.get(order.tailor) || order.tailor : "Unassigned",
        garmentTypes,
        reason: r.details || "",
        flaggedByEmail: r.user_email,
        flaggedByName: resolveUserName(r.user_email),
        flaggedAt: r.created_at,
        resolvedAt,
      });
    }
  }

  rows.sort((a, b) => b.flaggedAt.localeCompare(a.flaggedAt));

  return NextResponse.json({ rows });
}
