import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { computeLineItemsTotal, type SalesLineItem } from "@/lib/sales";
import { computeGst } from "@/lib/gst";

const lineItemSchema = z.object({
  productId: z.string().nullable().optional(),
  productName: z.string(),
  qty: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  discountType: z.enum(["flat", "percent"]).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  discountFlat: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  amount: z.number().nonnegative(),
});

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  quoteNumber: z.string().min(1),
  customerMobile: z.string().min(1),
  customerName: z.string().default(""),
  date: z.string().min(1),
  validUntil: z.string().nullable().optional(),
  status: z.enum(["draft", "sent", "accepted", "expired", "cancelled"]),
  items: z.array(lineItemSchema),
  gstType: z.enum(["none", "intra", "inter"]),
  taxRate: z.number(),
  notes: z.string().default(""),
});

/** Create/update a sales quotation. Previously ran entirely client-side with no permission
 *  check. */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to manage quotations" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const isNew = !fd.id;
  const taxableAmount = computeLineItemsTotal(fd.items as unknown as SalesLineItem[]);
  const gst = computeGst(taxableAmount, fd.taxRate, fd.gstType);

  const { data, error } = await db
    .from("sales_quotations")
    .upsert({
      id: fd.id,
      quote_number: fd.quoteNumber,
      customer_mobile: fd.customerMobile,
      customer_name: fd.customerName,
      date: fd.date,
      valid_until: fd.validUntil || null,
      status: fd.status,
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

  await logAction(supabase, user.email, isNew ? `Quotation created: ${fd.quoteNumber}` : `Quotation updated: ${fd.quoteNumber}`, null, `₹${gst.total}`);
  return NextResponse.json({ quotation: data });
}
