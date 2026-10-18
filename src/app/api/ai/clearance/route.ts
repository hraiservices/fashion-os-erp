import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { aiErrorResponse, aiJson, SHOP_VOICE } from "@/lib/ai-assist";
import { isRestrictedRole } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({
  items: z
    .array(z.object({ name: z.string().max(100), type: z.enum(["product", "raw_material"]), qty: z.number().min(0), ageDays: z.number().int().min(0), unitCost: z.number().min(0), value: z.number().min(0) }))
    .min(1)
    .max(15),
});

interface Idea { items?: string[]; idea?: string; discountPercent?: number; message?: string }

/** POST — ways to clear stock that has sat unsold: bundles, small discounts, who to offer it to. Suggestions only. */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (isRestrictedRole(user.role)) return NextResponse.json({ error: "You don't have permission to do that" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });
  const names = new Set(parsed.data.items.map((i) => i.name));
  try {
    const out = await aiJson<{ ideas?: Idea[] }>(
      serviceClient,
      "deadstock",
      `${SHOP_VOICE}\nYou help a tailoring and fashion boutique clear stock that has sat unsold. Raw materials (fabric, lace, buttons) can be used in custom orders or sold as a bundle; products can be discounted or bundled. Answer as JSON: {"ideas": [up to 5 items {"items": [names, copied exactly from the list], "idea": one practical sentence, "discountPercent": a suggested discount 0-40 or 0 for none — NEVER so deep that the price falls below the unit cost given, "message": a short WhatsApp offer text for customers, no invented prices}]}. Prefer ideas that use old stock in real orders (for example offering a fabric as a free upgrade on a bridal order) over plain discounts.`,
      [{ text: JSON.stringify(parsed.data.items) }],
      user.email
    );
    return NextResponse.json({
      ideas: (out.ideas ?? []).slice(0, 5).map((i) => ({
        items: (i.items ?? []).filter((n) => names.has(String(n))).slice(0, 6),
        idea: String(i.idea ?? "").slice(0, 300),
        discountPercent: Math.min(40, Math.max(0, Math.round(Number(i.discountPercent) || 0))),
        message: String(i.message ?? "").slice(0, 500),
      })),
    });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
