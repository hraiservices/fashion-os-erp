import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyStockMatches } from "@/lib/stock-match-notify";

const bodySchema = z.object({
  productId: z.string().min(1),
  /** Only positive movements (restock/opening stock) are worth notifying about. */
  movement: z.number(),
});

/**
 * Phase 5 of Customer Purchase Intelligence: fired (best-effort, fire-and-forget from the
 * client) whenever a product's stock increases. Runs the Phase 3 matching engine server-side
 * — it needs the VAPID private key, which never reaches the browser — and pushes a single
 * broadcast notification if there are strong matches. This intentionally does NOT target
 * individual customers' devices (there's no such concept — push subscriptions belong to shop
 * staff, not end customers); it tells the merchant "N customers may want this," and tapping it
 * opens the product's edit page, which already has the full "Potential customers" list (Phase 3).
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { productId, movement } = parsed.data;
  if (movement <= 0) return NextResponse.json({ ok: true, skipped: "not a stock increase" });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ ok: true, skipped: "not configured" });

  const result = await notifyStockMatches(supabase, [productId]);
  return NextResponse.json({ ok: true, matches: result.matches });
}
