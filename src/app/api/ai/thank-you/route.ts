import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getServerUser } from "@/lib/auth-server";
import { aiErrorResponse, aiText, SHOP_VOICE } from "@/lib/ai-assist";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({ orderId: z.string().trim().min(1).max(40) });

/** POST — a warm, personal thank-you for a delivered order (mentions the outfit, asks for a Google review if the shop has a link). A draft for staff to send. */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.editOrder && !user.perms.manageLeads) return NextResponse.json({ error: "You don't have permission to message customers" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing order" }, { status: 400 });
  const db: SupabaseClient<Database> | null = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });

  const [{ data: order }, { data: shopRow }] = await Promise.all([
    db.from("orders").select("id, name, garments, status").eq("id", parsed.data.orderId).maybeSingle(),
    db.from("app_settings").select("value").eq("key", "shop").maybeSingle(),
  ]);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const shop = (shopRow?.value ?? {}) as { name?: string; reviewUrl?: string };
  const link = (shop.reviewUrl ?? "").trim();
  const garments = Array.isArray(order.garments) ? [...new Set(order.garments.map((g) => String((g as { type?: string })?.type ?? "").trim()).filter(Boolean))].slice(0, 4) : [];
  const first = order.name.trim().split(/\s+/)[0] || "there";

  try {
    const drafted = await aiText(
      db,
      "thanks",
      `${SHOP_VOICE}\nWrite ONE WhatsApp thank-you from ${shop.name || "the boutique"} to a customer who just collected their order. Start with "Hi ${first}!". Mention the outfit naturally (${garments.join(", ") || "their outfit"}), say you hope they love it, and invite them to come back for their next occasion.${link ? ` Gently ask for a quick Google review and include the exact text {link} where the link goes.` : " Do not mention reviews or links."} Under 55 words, one or two emojis at most. Never invent offers, prices or dates. Output only the message.`,
      [{ text: `Customer: ${order.name}\nOutfit: ${garments.join(", ") || "not listed"}` }],
      user.email
    );
    const text = (link ? drafted.replaceAll("{link}", link) : drafted.replaceAll("{link}", "")).trim();
    return NextResponse.json({ text });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
