import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { aiErrorResponse, aiJson, SHOP_VOICE } from "@/lib/ai-assist";
import { upcomingFestival } from "@/lib/festivals";
import { isRestrictedRole } from "@/lib/permissions";
import { buildShopSnapshot } from "@/lib/shop-snapshot";
import { createServiceClient } from "@/lib/supabase/service";

interface PlanPost { day?: string; kind?: string; idea?: string; caption?: string; hashtags?: string[] }
interface PlanReel { title?: string; hook?: string; scenes?: string[]; caption?: string }

/** POST — a week of Instagram posts and a few reel scripts, based on the shop's real recent orders and best sellers. Managers only. */
export async function POST() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (isRestrictedRole(user.role)) return NextResponse.json({ error: "Only managers can plan social posts" }, { status: 403 });
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });

  const snapshot = await buildShopSnapshot(serviceClient);
  const festival = upcomingFestival(snapshot.today, 60);
  const { data: shopRow } = await serviceClient.from("app_settings").select("value").eq("key", "shop").maybeSingle();
  const shopName = (shopRow?.value as { name?: string } | null)?.name ?? "";

  try {
    const out = await aiJson<{ posts?: PlanPost[]; reels?: PlanReel[] }>(
      serviceClient,
      "social",
      `${SHOP_VOICE}\nYou plan Instagram content for ${shopName || "a tailoring and fashion boutique"}. Use ONLY the facts given (what has been selling, the coming festival); do not invent offers, prices, discounts or customer names. Write captions in warm Hinglish-friendly English, short, with 1–2 emojis. Answer as JSON: {"posts": [7 items {"day": "Mon".."Sun", "kind": "post"|"story"|"reel", "idea": what to photograph or show (staff will take their own photos), "caption": ready to paste, "hashtags": [5-8 relevant hashtags]}], "reels": [3 items {"title", "hook": first 2 seconds, "scenes": [3-5 short shot descriptions], "caption"}]}.`,
      [{ text: JSON.stringify({ snapshot, upcomingFestival: festival }) }],
      user.email
    );
    const clean = (s: unknown, n: number) => String(s ?? "").slice(0, n);
    return NextResponse.json({
      basedOn: { orders: snapshot.ordersInWindow, topGarments: snapshot.topGarments.slice(0, 4), festival: festival?.name ?? null },
      posts: (out.posts ?? []).slice(0, 7).map((p) => ({ day: clean(p.day, 10), kind: ["post", "story", "reel"].includes(String(p.kind)) ? String(p.kind) : "post", idea: clean(p.idea, 300), caption: clean(p.caption, 600), hashtags: (p.hashtags ?? []).slice(0, 8).map((h) => clean(h, 40)) })),
      reels: (out.reels ?? []).slice(0, 3).map((r) => ({ title: clean(r.title, 100), hook: clean(r.hook, 200), scenes: (r.scenes ?? []).slice(0, 6).map((s) => clean(s, 200)), caption: clean(r.caption, 600) })),
    });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
