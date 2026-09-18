import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapPosSessionRow } from "@/lib/types";
import { logAction } from "@/lib/logging";

const openSchema = z.object({ action: z.literal("open"), openingCash: z.number().min(0) });
const closeSchema = z.object({ action: z.literal("close"), sessionId: z.string().min(1), closingCash: z.number().min(0) });
const bodySchema = z.discriminatedUnion("action", [openSchema, closeSchema]);

/**
 * Opening and closing the cash register. Moved off the direct browser writes in
 * use-pos-session.ts, which had two problems beyond pos_sessions simply being world-writable
 * under the default RLS:
 *
 *  - `opened_by` came from the request, so the register could be opened in someone else's name.
 *  - `expected_cash` — the figure the drawer is reconciled against — was computed in the browser
 *    and stored as given. A cashier could take cash out and submit an expected_cash equal to
 *    their short closing_cash, and the variance the whole control depends on would read zero.
 *
 * Both are now derived server-side: the actor from the session cookie, and expected_cash from
 * the session's own opening float plus the Cash sales_payments actually recorded against it.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.usePOS) return NextResponse.json({ error: "No permission to use the POS" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  // pos_sessions is write-locked for `authenticated` — see lockdown_operational_writes.sql.
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  if (parsed.data.action === "open") {
    // One open register at a time — two overlapping sessions would split the same cash drawer
    // across two reconciliations and make both wrong.
    const { data: alreadyOpen } = await db.from("pos_sessions").select("id").eq("status", "open").limit(1).maybeSingle();
    if (alreadyOpen) return NextResponse.json({ error: "A register session is already open." }, { status: 409 });

    const { data, error } = await db
      .from("pos_sessions")
      .insert({ opening_cash: parsed.data.openingCash, opened_by: user.email, status: "open" })
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Could not open the register" }, { status: 500 });

    await logAction(supabase, user.email, `Register opened with ₹${parsed.data.openingCash}`);
    return NextResponse.json({ session: mapPosSessionRow(data) });
  }

  const { sessionId, closingCash } = parsed.data;
  const { data: session } = await db.from("pos_sessions").select("id, status, opening_cash").eq("id", sessionId).maybeSingle();
  if (!session) return NextResponse.json({ error: "Register session not found" }, { status: 404 });
  if (session.status !== "open") return NextResponse.json({ error: "That register session is already closed." }, { status: 409 });

  // Authoritative expected cash: the opening float plus every Cash payment taken on this
  // session. Never the browser's arithmetic — that is the number the variance is measured from.
  const { data: cashRows, error: cashError } = await db
    .from("sales_payments")
    .select("amount")
    .eq("pos_session_id", sessionId)
    .eq("method", "Cash");
  if (cashError) return NextResponse.json({ error: cashError.message }, { status: 500 });
  const cashTaken = (cashRows || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  const expectedCash = Math.round((session.opening_cash + cashTaken) * 100) / 100;

  const { error } = await db
    .from("pos_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString(), closing_cash: closingCash, expected_cash: expectedCash })
    .eq("id", sessionId)
    .eq("status", "open");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const variance = Math.round((closingCash - expectedCash) * 100) / 100;
  await logAction(
    supabase,
    user.email,
    `Register closed — counted ₹${closingCash}, expected ₹${expectedCash}${variance === 0 ? "" : ` (variance ₹${variance})`}`
  );
  return NextResponse.json({ ok: true, expectedCash, variance });
}
