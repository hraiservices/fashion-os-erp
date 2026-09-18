import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { computeLineItemsTotal, purchaseItemType, purchaseItemId, type PurchaseLineItem } from "@/lib/purchases";

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
  vendorId: z.string().uuid(),
  billId: z.string().uuid(),
  billNumber: z.string().min(1),
  creditNumber: z.string().min(1),
  date: z.string().min(1),
  items: z.array(lineItemSchema),
  reason: z.string().default(""),
  notes: z.string().default(""),
});

/**
 * Raise a vendor credit (return) against a bill. Previously ran entirely client-side
 * (useRaiseVendorCredit) with no permission check, AND validated only the aggregate ₹ total
 * against the bill's remaining creditable balance — never against what the bill actually
 * contained. A credit could reference a completely unrelated product/quantity that was never
 * on the bill at all, inserting a phantom restock into inventory_ledger. Now caps each returned
 * line's quantity at (that item's billed quantity − already-credited quantity for that item).
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to manage vendor credits" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const items = fd.items as PurchaseLineItem[];

  const total = computeLineItemsTotal(items);
  if (total <= 0) return NextResponse.json({ error: "Add at least one returned item" }, { status: 400 });

  const { data: bill } = await db.from("purchase_bills").select("items").eq("id", fd.billId).maybeSingle();
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const billedQty = new Map<string, number>();
  for (const i of (bill.items as unknown as PurchaseLineItem[]) || []) {
    const key = `${purchaseItemType(i)}:${purchaseItemId(i)}`;
    if (!purchaseItemId(i)) continue;
    billedQty.set(key, (billedQty.get(key) || 0) + (i.qty || 0));
  }

  const { data: existingCredits } = await db.from("vendor_credits").select("items").eq("bill_id", fd.billId);
  const alreadyCreditedQty = new Map<string, number>();
  for (const c of existingCredits || []) {
    for (const i of (c.items as unknown as PurchaseLineItem[]) || []) {
      const key = `${purchaseItemType(i)}:${purchaseItemId(i)}`;
      if (!purchaseItemId(i)) continue;
      alreadyCreditedQty.set(key, (alreadyCreditedQty.get(key) || 0) + (i.qty || 0));
    }
  }

  for (const i of items) {
    const key = `${purchaseItemType(i)}:${purchaseItemId(i)}`;
    const billed = billedQty.get(key) || 0;
    const creditedSoFar = alreadyCreditedQty.get(key) || 0;
    const remaining = billed - creditedSoFar;
    if ((i.qty || 0) > remaining + 0.001) {
      return NextResponse.json(
        { error: `Cannot return ${i.qty} of "${i.rawMaterialName || i.productName || "item"}" — only ${Math.max(0, remaining)} of that item on this bill remain un-returned.` },
        { status: 422 }
      );
    }
  }

  const { data, error } = await db
    .from("vendor_credits")
    .insert({
      credit_number: fd.creditNumber,
      vendor_id: fd.vendorId,
      bill_id: fd.billId,
      date: fd.date,
      items: fd.items as never,
      total,
      reason: fd.reason.trim(),
      notes: fd.notes.trim(),
      created_by: user.email,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ledgerRows = items
    .filter((i) => purchaseItemId(i) && i.qty > 0)
    .map((i) => ({
      item_type: purchaseItemType(i),
      item_id: purchaseItemId(i),
      movement: -i.qty,
      ref_type: "purchase_return" as const,
      ref_id: data.id,
      note: `Return against bill ${fd.billNumber}`,
      created_by: user.email,
    }));
  if (ledgerRows.length) {
    const { error: ledgerError } = await db.from("inventory_ledger").insert(ledgerRows);
    if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  await logAction(supabase, user.email, `Vendor credit raised: ${fd.creditNumber} (₹${total}) against bill ${fd.billNumber}`);
  return NextResponse.json({ credit: data });
}
