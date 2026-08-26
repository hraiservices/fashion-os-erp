import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";
import { computeLineItemsTotal, purchaseItemType, purchaseItemId, type PurchaseLineItem } from "@/lib/purchases";
import { computeGst } from "@/lib/gst";

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
  billNumber: z.string().min(1),
  vendorId: z.string().uuid(),
  poId: z.string().uuid().nullable().optional(),
  billDate: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  items: z.array(lineItemSchema),
  gstType: z.enum(["none", "intra", "inter"]),
  taxRate: z.number(),
  notes: z.string().default(""),
});

/**
 * Create/update a purchase bill — receiving stock happens here (via replace_inventory_ledger).
 * Previously ran entirely client-side (useSaveBill) with no permission check at all — unlike
 * useDeleteBill, which was already correctly moved server-side.
 *
 * Editing a bill that already has payments or credits recorded against it is blocked, mirroring
 * the DELETE route's own guard and the same class of bug already fixed on the sales-invoice
 * side (editing a paid/credited invoice's line items silently desyncs inventory from what was
 * actually paid/returned against the original amounts).
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to manage bills" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const isNew = !fd.id;

  if (!isNew) {
    const [{ data: payments }, { data: credits }] = await Promise.all([
      supabase.from("vendor_payments").select("id").eq("bill_id", fd.id!).limit(1),
      supabase.from("vendor_credits").select("id").eq("bill_id", fd.id!).limit(1),
    ]);
    if ((payments && payments.length > 0) || (credits && credits.length > 0)) {
      return NextResponse.json(
        { error: "This bill has payments or vendor credits recorded against it and can no longer be edited. Delete those first if you need to correct it." },
        { status: 409 }
      );
    }
  }

  const taxableAmount = computeLineItemsTotal(fd.items as PurchaseLineItem[]);
  const gst = computeGst(taxableAmount, fd.taxRate, fd.gstType);

  const { data, error } = await supabase
    .from("purchase_bills")
    .upsert({
      id: fd.id,
      bill_number: fd.billNumber,
      vendor_id: fd.vendorId,
      po_id: fd.poId || null,
      bill_date: fd.billDate,
      due_date: fd.dueDate || null,
      items: fd.items as never,
      taxable_amount: gst.taxableAmount,
      gst_type: fd.gstType,
      tax_rate: fd.taxRate,
      cgst: gst.cgst,
      sgst: gst.sgst,
      igst: gst.igst,
      total: gst.total,
      notes: fd.notes.trim(),
      created_by: user.email,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ledgerRows = fd.items
    .filter((i) => purchaseItemId(i as PurchaseLineItem) && i.qty > 0)
    .map((i) => ({
      item_type: purchaseItemType(i as PurchaseLineItem),
      item_id: purchaseItemId(i as PurchaseLineItem),
      movement: i.qty,
      note: `Bill ${fd.billNumber}`,
      created_by: user.email,
    }));
  const { error: ledgerError } = await supabase.rpc("replace_inventory_ledger", {
    p_ref_type: "purchase",
    p_ref_id: data.id,
    p_rows: ledgerRows,
  });
  if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: 500 });

  await logAction(supabase, user.email, isNew ? `Bill received: ${fd.billNumber}` : `Bill updated: ${fd.billNumber}`, null, `₹${gst.total}`);
  return NextResponse.json({ bill: data });
}
