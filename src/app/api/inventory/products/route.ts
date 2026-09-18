import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { genBarcode, type ItemType } from "@/lib/inventory";

const bomLineSchema = z.object({
  rawMaterialId: z.string(),
  qtyRequired: z.number(),
});

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1),
  category: z.string().default(""),
  sellingPrice: z.number().min(0),
  costPrice: z.number().min(0),
  taxRate: z.number().min(0),
  lowStockAlert: z.number().min(0).default(0),
  notes: z.string().default(""),
  bom: z.array(bomLineSchema).default([]),
  openingStock: z.number().optional(),
  barcode: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  fabric: z.string().optional(),
  pattern: z.string().optional(),
  occasion: z.string().optional(),
  brand: z.string().optional(),
  imageDataUrl: z.string().nullable().optional(),
});

/**
 * Create/update a product (+ its bill-of-materials + opening stock). Previously ran entirely
 * client-side (useSaveProduct) with no permission check at all — any authenticated user,
 * including roles with manageInventory explicitly false, could create/rewrite product prices,
 * cost, and BOM.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const isNew = !fd.id;

  const { data, error } = await db
    .from("products")
    .upsert({
      id: fd.id,
      name: fd.name.trim(),
      sku: fd.sku.trim(),
      category: fd.category.trim(),
      selling_price: fd.sellingPrice,
      cost_price: fd.costPrice,
      tax_rate: fd.taxRate,
      low_stock_alert: fd.lowStockAlert,
      notes: fd.notes.trim(),
      barcode: fd.barcode?.trim() || genBarcode(),
      size: fd.size || null,
      color: fd.color || null,
      fabric: fd.fabric || null,
      pattern: fd.pattern || null,
      occasion: fd.occasion || null,
      brand: fd.brand?.trim() || null,
      image_data_url: fd.imageDataUrl ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Replace BOM lines wholesale — same pattern as cost_sheet_items.
  await db.from("bill_of_materials").delete().eq("product_id", data.id);
  const bomRows = fd.bom.filter((b) => b.rawMaterialId && b.qtyRequired > 0).map((b) => ({ product_id: data.id, raw_material_id: b.rawMaterialId, qty_required: b.qtyRequired }));
  if (bomRows.length) {
    const { error: bomError } = await db.from("bill_of_materials").insert(bomRows);
    if (bomError) return NextResponse.json({ error: bomError.message }, { status: 500 });
  }

  if (isNew && fd.openingStock && fd.openingStock > 0) {
    const { error: ledgerError } = await db.from("inventory_ledger").insert({
      item_type: "product" as ItemType,
      item_id: data.id,
      movement: fd.openingStock,
      ref_type: "opening",
      note: "Opening stock",
      created_by: user.email,
    });
    if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  await logAction(supabase, user.email, isNew ? `Product added: ${fd.name}` : `Product updated: ${fd.name}`);
  return NextResponse.json({ product: data });
}
