import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { aiErrorResponse, aiText, SHOP_VOICE } from "@/lib/ai-assist";
import { isRestrictedRole } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({
  festival: z.string().max(60).nullable(),
  items: z.array(z.object({ name: z.string().max(100), qty: z.number().min(0.01).max(1_000_000), unit: z.string().max(20) })).min(1).max(30),
});

/** POST — a short message asking a fabric vendor for a quote and delivery date for the listed items. Staff edit and send it themselves. */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (isRestrictedRole(user.role)) return NextResponse.json({ error: "You don't have permission to do that" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });
  const d = parsed.data;
  try {
    const text = await aiText(
      serviceClient,
      "forecast",
      `${SHOP_VOICE}\nWrite a short, polite WhatsApp message from a boutique to a fabric/material supplier asking for their best rate and earliest delivery date for the listed items${d.festival ? `, because the ${d.festival} season is coming` : ""}. List each item with its quantity and unit on its own line. Do not invent prices or dates. Under 90 words. Output only the message.`,
      [{ text: d.items.map((i) => `${i.name}: ${i.qty} ${i.unit}`).join("\n") }],
      user.email
    );
    return NextResponse.json({ text });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
