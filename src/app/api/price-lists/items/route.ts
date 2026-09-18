import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({
  priceListId: z.string().uuid(),
  productId: z.string().uuid(),
  price: z.number().min(0),
});

/** Upsert one price-list line (a product's override price within a price list). Previously ran
 *  entirely client-side with no permission check. */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to manage price lists" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const { error } = await db
    .from("price_list_items")
    .upsert({ price_list_id: fd.priceListId, product_id: fd.productId, price: fd.price }, { onConflict: "price_list_id,product_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
