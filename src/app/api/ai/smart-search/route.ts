import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { aiErrorResponse, aiJson, SHOP_VOICE } from "@/lib/ai-assist";
import { isRestrictedRole } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({ query: z.string().trim().min(3).max(200) });
const MAX_ORDERS = 1200;
const MAX_CUSTOMERS = 1200;

/**
 * POST — natural-language search ("Meera's blue lehenga from last Diwali"). The AI only ever picks ids from the lists
 * it was given, so every result is a real order or customer; ids it invents are dropped. Staff with a restricted role
 * (tailors, sales) search orders only, matching what the normal search bar shows them.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type a few words to search for" }, { status: 400 });
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });
  const restricted = isRestrictedRole(user.role);

  const [ordersRes, customersRes] = await Promise.all([
    serviceClient.from("orders").select("id, name, mobile, status, in_date, delivery_date, garments, special, total").order("created_at", { ascending: false }).limit(MAX_ORDERS),
    restricted ? Promise.resolve({ data: [] as { name: string; mobile: string }[] }) : serviceClient.from("customers").select("name, mobile").limit(MAX_CUSTOMERS),
  ]);
  const orders = ordersRes.data || [];
  const customers = customersRes.data || [];

  const garmentTypes = (g: unknown) => (Array.isArray(g) ? g.map((x) => (x as { type?: string })?.type).filter(Boolean).join("+") : "");
  const orderLines = orders.map((o) => `${o.id}|${o.name}|${o.mobile}|${o.status}|in ${o.in_date}|due ${o.delivery_date}|${garmentTypes(o.garments)}|₹${o.total}|${(o.special || "").slice(0, 60).replace(/\n/g, " ")}`);
  const customerLines = customers.map((c) => `${c.mobile}|${c.name}`);

  try {
    const out = await aiJson<{ orderIds?: string[]; customerMobiles?: string[] }>(
      serviceClient,
      "search",
      `${SHOP_VOICE}\nYou search a tailoring shop's records. Given a request, pick the matching orders and customers ONLY from the lists provided — copy ids exactly, never invent one. Answer as JSON: {"orderIds": [up to 8 order ids, best match first], "customerMobiles": [up to 5 customer mobiles]}. Match loosely on names (spelling variants, first names), garments, dates ("last Diwali" means around that festival in the most recent year it appears in the data) and notes. Return empty lists if nothing fits.`,
      [{ text: `REQUEST: ${parsed.data.query}\n\nORDERS (id|name|mobile|status|in date|due date|garments|total|notes):\n${orderLines.join("\n")}\n\nCUSTOMERS (mobile|name):\n${customerLines.join("\n")}` }],
      user.email
    );
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const customerByMobile = new Map(customers.map((c) => [c.mobile, c]));
    return NextResponse.json({
      orders: (out.orderIds ?? []).map((id) => orderById.get(String(id))).filter((o): o is NonNullable<typeof o> => !!o).slice(0, 8).map((o) => ({ id: o.id, name: o.name, status: o.status, deliveryDate: o.delivery_date })),
      customers: (out.customerMobiles ?? []).map((m) => customerByMobile.get(String(m))).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 5).map((c) => ({ name: c.name, mobile: c.mobile })),
    });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
