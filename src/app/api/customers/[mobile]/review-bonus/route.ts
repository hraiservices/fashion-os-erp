import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { DEFAULT_LOYALTY_CONFIG, reviewBonusPoints, type LoyaltyConfig } from "@/lib/business-rules";

const bodySchema = z.object({ name: z.string().min(1) });

/** Staff confirms a customer actually left the Google review they were asked for — see
 *  "Got a review" on the Today tab's review-ask card. There's no way to verify a review was
 *  left automatically (no Google API hookup), so this is a manual, permission-gated grant, same
 *  shape as /api/customers/[mobile]/loyalty-bonus but fixed to the configured review bonus. */
export async function POST(request: Request, { params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.awardLoyaltyPoints) return NextResponse.json({ error: "No permission to grant loyalty points" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { name } = parsed.data;

  const { data: cfgRow } = await db.from("app_settings").select("value").eq("key", "loyalty").maybeSingle();
  const cfg = { ...DEFAULT_LOYALTY_CONFIG, ...((cfgRow?.value as Partial<LoyaltyConfig>) || {}) };
  if (!cfg.enabled) return NextResponse.json({ error: "Loyalty program is turned off" }, { status: 400 });
  const pts = reviewBonusPoints(cfg);

  try {
    await awardLoyaltyPoints(db, mobile, name, pts, "manual", null, "Google review received 🌟");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to grant points" }, { status: 500 });
  }

  await logAction(supabase, user.email, `🌟 Review bonus: +${pts} pts to ${name} (${mobile})`);
  return NextResponse.json({ ok: true, pts });
}
