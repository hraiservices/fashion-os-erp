import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeCashAndMethods, isDayClosed } from "@/lib/day-book-server";
import { logAction } from "@/lib/logging";
import { istDateString } from "@/lib/ist-date";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Closes (or re-closes) a day: records the cash actually counted against what the system
 * expected. Expected cash and opening cash are recomputed here from the source tables — the
 * client only ever supplies the counted figure and a note, so a stale or tampered page can't
 * write a wrong "expected".
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.viewReports || !(user.perms.managePayments || user.role === "admin")) {
    return NextResponse.json({ error: "No permission to close the day" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { date?: string; countedCash?: unknown; note?: unknown } | null;
  const date = body?.date || "";
  const counted = Number(body?.countedCash);
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  if (date > istDateString()) return NextResponse.json({ error: "Can't close a day that hasn't happened yet" }, { status: 400 });
  if (!Number.isFinite(counted) || counted < 0) return NextResponse.json({ error: "Enter the counted cash (0 or more)" }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  // Once closed, only an admin can re-close — otherwise the counted figure (and the next day's
  // opening cash, which is built from it) could be rewritten by anyone who can close a day.
  if (user.role !== "admin" && (await isDayClosed(db, date))) {
    return NextResponse.json({ error: "This day is already closed — only an admin can re-close it." }, { status: 403 });
  }

  const { cash } = await computeCashAndMethods(db, date);
  const variance = Math.round((counted - cash.expected) * 100) / 100;

  const { error } = await db.from("day_book_closings").upsert({
    close_date: date,
    opening_cash: cash.opening,
    expected_cash: cash.expected,
    counted_cash: counted,
    variance,
    note,
    closed_by: user.email,
    closed_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(db, user.email, `🔒 Day closed: ${date}`, null, `Counted ₹${counted}, expected ₹${cash.expected}, variance ₹${variance}${note ? ` — ${note}` : ""}`);
  return NextResponse.json({ ok: true, variance, expected: cash.expected });
}
