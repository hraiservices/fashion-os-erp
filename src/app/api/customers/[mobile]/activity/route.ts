import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const PAGE_SIZE = 25;

export interface CustomerActivityEvent {
  id: string;
  text: string;
  actor: string | null;
  createdAt: string;
}

/**
 * Chronological activity feed for one customer, Zoho-style — merged from two existing sources
 * rather than a from-scratch event log:
 *  - activity_log: the ~140 existing logAction() call sites across the app already cover order
 *    stage changes, payments, rework, rename, invoices, measurement profile changes and manual
 *    loyalty grants. Order-scoped rows (the majority) are joined here via order_id → this
 *    customer's own order ids; a handful of non-order-scoped events (profile edits, measurement
 *    profile changes, invoices, manual loyalty grants) carry their own customer_mobile column
 *    instead (see supabase/migrations/add_customer_activity_log_photo.sql — "needs SQL", see PR
 *    body). Until that migration runs, the customer_mobile column read below simply errors and
 *    this falls back to the order_id-only join, so the page never crashes either way.
 *  - whatsapp_message_log: every outbound WhatsApp send already logged here by
 *    src/lib/whatsapp-log.ts, filtered by to_mobile.
 */
export async function GET(request: Request, { params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = await params;
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const url = new URL(request.url);
  const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10) || 0);
  const fetchLimit = (page + 1) * PAGE_SIZE;

  const { data: orderRows } = await db.from("orders").select("id").eq("mobile", mobile);
  const orderIds = (orderRows || []).map((o) => o.id);

  type ActivityRow = { id: number; action: string; user_name: string | null; created_at: string };
  let activityRows: ActivityRow[] = [];
  // Try the migration-dependent customer_mobile join first; fall back to order_id-only if the
  // column doesn't exist yet on this database (see module doc comment above).
  const orFilter = orderIds.length > 0 ? `customer_mobile.eq.${mobile},order_id.in.(${orderIds.join(",")})` : `customer_mobile.eq.${mobile}`;
  const withMobile = await db
    .from("activity_log")
    .select("id, action, user_name, created_at")
    .or(orFilter)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);
  if (!withMobile.error) {
    activityRows = withMobile.data || [];
  } else if (orderIds.length > 0) {
    const fallback = await db
      .from("activity_log")
      .select("id, action, user_name, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false })
      .limit(fetchLimit);
    activityRows = fallback.data || [];
  }

  const { data: waRows } = await db
    .from("whatsapp_message_log")
    .select("id, message_type, status, created_at")
    .eq("to_mobile", mobile)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  const WA_LABELS: Record<string, string> = {
    concierge_reply: "Order-status reply",
    ready_nudge: "Ready-for-pickup notification",
    daily_briefing: "Daily briefing",
    payment_reminder: "Payment reminder",
    recommendation: "Product recommendation",
    sales_template: "Sales message",
    broadcast: "Broadcast message",
  };

  const merged: CustomerActivityEvent[] = [
    ...activityRows.map((r) => ({ id: `al-${r.id}`, text: r.action, actor: r.user_name, createdAt: r.created_at })),
    ...(waRows || []).map((r) => ({
      id: `wa-${r.id}`,
      text: `${WA_LABELS[r.message_type] || "WhatsApp message"} sent${r.status === "failed" ? " (failed)" : ""}`,
      actor: null,
      createdAt: r.created_at,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const start = page * PAGE_SIZE;
  const events = merged.slice(start, start + PAGE_SIZE);
  // Best-effort "is there more" signal — true whenever either source returned a full page at
  // the current fetch depth, since a short page from one source could still be masking more
  // rows sitting further back in the other.
  const hasMore = activityRows.length >= fetchLimit || (waRows || []).length >= fetchLimit;

  return NextResponse.json({ events, hasMore });
}
