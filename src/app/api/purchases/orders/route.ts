import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { computeLineItemsTotal, type PurchaseLineItem } from "@/lib/purchases";

const lineItemSchema = z.object({
  itemType: z.enum(["raw_material", "product"]).optional(),
  rawMaterialId: z.string().optional(),
  rawMaterialName: z.string().optional(),
  productId: z.string().optional(),
  productName: z.string().optional(),
  unitName: z.string(),
  qty: z.number(),
  unitCost: z.number(),
  amount: z.number(),
});

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  poNumber: z.string().min(1),
  vendorId: z.string().uuid(),
  date: z.string().min(1),
  status: z.enum(["draft", "sent", "received", "cancelled"]),
  items: z.array(lineItemSchema),
  notes: z.string().default(""),
});

/**
 * Create/update a purchase order (a planning document — no stock impact until a bill is
 * raised against it). Previously ran entirely client-side (useSavePurchaseOrder) with no
 * permission check at all.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to manage purchase orders" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const isNew = !fd.id;
  const total = computeLineItemsTotal(fd.items as PurchaseLineItem[]);

  const { data, error } = await db
    .from("purchase_orders")
    .upsert({
      id: fd.id,
      po_number: fd.poNumber,
      vendor_id: fd.vendorId,
      date: fd.date,
      status: fd.status,
      items: fd.items as never,
      total,
      notes: fd.notes.trim(),
      created_by: user.email,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, isNew ? `Purchase order created: ${fd.poNumber}` : `Purchase order updated: ${fd.poNumber}`);
  return NextResponse.json({ purchaseOrder: data });
}
