import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { aiErrorResponse, aiText, SHOP_VOICE } from "@/lib/ai-assist";
import { isRestrictedRole } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  amount: z.number().min(1).max(100_000_000),
  daysLate: z.number().int().min(0).max(3650),
  tone: z.enum(["gentle", "friendly", "firm"]),
  refs: z.array(z.string().max(60)).max(6),
  orderCount: z.number().int().min(0).max(10_000),
});

/** POST — a payment-reminder message in the right tone. A suggestion for staff to read and send themselves. */
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
      "collections",
      `${SHOP_VOICE}\nWrite one WhatsApp payment reminder from the shop. Tone: ${d.tone} (gentle = a loyal customer, just a note; friendly = polite reminder; firm = clear, still respectful, asks for payment today or a reply). Mention the exact amount ₹${d.amount} and what it is for. Never threaten, never mention legal action or fees. Under 50 words. Output only the message.`,
      [{ text: `Customer: ${d.name}\nAmount pending: ₹${d.amount}\nFor: ${d.refs.join(", ")}\nDays late: ${d.daysLate}\nPast orders with us: ${d.orderCount}` }],
      user.email
    );
    return NextResponse.json({ text });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
