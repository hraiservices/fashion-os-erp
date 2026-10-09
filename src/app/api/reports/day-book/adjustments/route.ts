import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { isDayClosed } from "@/lib/day-book-server";
import { ADJUSTMENT_REASONS } from "@/lib/day-book-insights";
import { logAction } from "@/lib/logging";
import { istDateString } from "@/lib/ist-date";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cash adjustments — money that enters or leaves the drawer without being a payment, expense
 * or vendor payment (bank deposit, owner withdrawal, salary handed over in cash, float top-up).
 * Same gate as closing the day, and — once a day is closed — admin only, so the closed
 * figure can't be quietly rewritten afterwards.
 */
async function authorize() {
  const { user } = await getServerUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) } as const;
  if (!user.perms.viewReports || !(user.perms.managePayments || user.role === "admin")) {
    return { error: NextResponse.json({ error: "No permission to record cash adjustments" }, { status: 403 }) } as const;
  }
  const db = createServiceClient();
  if (!db) return { error: NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 }) } as const;
  return { user, db } as const;
}

export async function POST(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const { user, db } = auth;

  const body = (await request.json().catch(() => null)) as { date?: string; kind?: string; amount?: unknown; reason?: string; note?: unknown } | null;
  const date = body?.date || "";
  const amount = Number(body?.amount);
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  if (date > istDateString()) return NextResponse.json({ error: "Can't record cash for a day that hasn't happened yet" }, { status: 400 });
  if (body?.kind !== "in" && body?.kind !== "out") return NextResponse.json({ error: "kind must be 'in' or 'out'" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter an amount greater than 0" }, { status: 400 });
  const reason = (ADJUSTMENT_REASONS as readonly string[]).includes(body?.reason || "") ? (body!.reason as string) : "Other";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) : "";

  if (user.role !== "admin" && (await isDayClosed(db, date))) {
    return NextResponse.json({ error: "This day is closed — only an admin can change its cash." }, { status: 403 });
  }

  const { error } = await db.from("day_book_cash_adjustments").insert({ adj_date: date, kind: body.kind, amount, reason, note, created_by: user.email });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(db, user.email, `💵 Cash ${body.kind === "in" ? "in" : "out"}: ₹${amount} — ${reason}`, null, `${date}${note ? ` — ${note}` : ""}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const { user, db } = auth;

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: row } = await db.from("day_book_cash_adjustments").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Adjustment not found" }, { status: 404 });
  if (user.role !== "admin" && (await isDayClosed(db, row.adj_date))) {
    return NextResponse.json({ error: "This day is closed — only an admin can change its cash." }, { status: 403 });
  }

  const { error } = await db.from("day_book_cash_adjustments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(db, user.email, `🗑️ Cash adjustment removed: ₹${row.amount} ${row.kind} — ${row.reason}`, null, row.adj_date);
  return NextResponse.json({ ok: true });
}
