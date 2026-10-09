import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { rangeTotals } from "@/lib/day-book-server";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 93;

/** Per-day money totals across a date range (week/month view of the Day Book). Same
 *  viewReports gate as the single-day route; service client for the same reason (see there). */
export async function GET(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.viewReports) return NextResponse.json({ error: "No permission to view reports" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return NextResponse.json({ error: "Invalid range (expected from/to as YYYY-MM-DD, from <= to)" }, { status: 400 });
  }
  const spanDays = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000 + 1;
  if (spanDays > MAX_DAYS) return NextResponse.json({ error: `Range too long (max ${MAX_DAYS} days)` }, { status: 400 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  try {
    return NextResponse.json({ from, to, days: await rangeTotals(db, from, to) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load range" }, { status: 500 });
  }
}
