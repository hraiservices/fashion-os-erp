import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";

/** Manual grants are real money (points convert to discounts) — bound them. */
const MAX_MANUAL_BONUS = 5000;

const bodySchema = z.object({
  name: z.string().min(1),
  pts: z.number().int().refine((n) => n !== 0, "Points must be non-zero"),
});

/**
 * Manual loyalty bonus. Previously `useGiveLoyaltyBonus` called the award RPC straight
 * from the browser with no permission check and no bounds, so any authenticated user
 * could grant themselves unlimited points and convert them into unlimited discounts.
 */
export async function POST(request: Request, { params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageCustomers) return NextResponse.json({ error: "No permission to grant loyalty points" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { name, pts } = parsed.data;

  if (Math.abs(pts) > MAX_MANUAL_BONUS) {
    return NextResponse.json({ error: `Manual grants are limited to ±${MAX_MANUAL_BONUS} points.` }, { status: 400 });
  }

  try {
    await awardLoyaltyPoints(supabase, mobile, name, pts, "manual", null, `Manual bonus by ${user.email}`);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to grant points" }, { status: 500 });
  }

  await logAction(supabase, user.email, `🎁 Manual loyalty grant: ${pts > 0 ? "+" : ""}${pts} pts to ${name} (${mobile})`);
  return NextResponse.json({ ok: true });
}
