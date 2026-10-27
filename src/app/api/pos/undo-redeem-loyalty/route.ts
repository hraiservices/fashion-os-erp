import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";

const MAX_UNDO_PTS = 100_000;

const bodySchema = z.object({
  mobile: z.string().min(1),
  name: z.string().min(1),
  pts: z.number().int().positive().max(MAX_UNDO_PTS),
  invoiceNumber: z.string().min(1),
});

/**
 * Reverses a POS loyalty redemption (/api/pos/redeem-loyalty) the cashier removed from the cart
 * before completing the sale. Trusts the client for the points figure — unlike every other
 * loyalty-points route, there's no live balance to recompute this against, only "give back what
 * this cashier's own UI just took a moment ago" — bounded by MAX_UNDO_PTS and usePOS (not the
 * broader awardLoyaltyPoints permission) to keep it a narrow, same-session correction rather
 * than a general grant tool.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.usePOS) return NextResponse.json({ error: "No permission to use the POS" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { mobile, name, pts, invoiceNumber } = parsed.data;

  try {
    await awardLoyaltyPoints(db, mobile, name, pts, "manual", null, `POS redemption removed before checkout on ${invoiceNumber} — points returned`);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not return points" }, { status: 500 });
  }

  await logAction(supabase, user.email, `🎁 POS loyalty redemption undone: +${pts} pts returned to ${name} (${mobile})`, null, null, mobile);
  return NextResponse.json({ ok: true });
}
