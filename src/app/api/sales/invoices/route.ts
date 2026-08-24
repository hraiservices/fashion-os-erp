import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";
import { computeInvoiceTotals, type DiscountType } from "@/lib/invoice-totals";
import { type GstType } from "@/lib/gst";
import type { SalesLineItem } from "@/lib/sales";
import { DEFAULT_DOCUMENT_NUMBERING, formatDocNumber, periodKeyFor, type DocumentNumberingSettings } from "@/lib/document-numbering";

const lineItemSchema = z.object({
  productId: z.string().nullable().optional(),
  productName: z.string(),
  qty: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  discountType: z.enum(["flat", "percent"]).optional(),
  discountPercent: z.number().nonnegative().optional(),
  discountFlat: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  amount: z.number().nonnegative(),
});

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  invoiceNumber: z.string().min(1),
  customerMobile: z.string().min(1),
  customerName: z.string(),
  quoteId: z.string().uuid().nullable().optional(),
  invoiceDate: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  items: z.array(lineItemSchema),
  subject: z.string().default(""),
  shippingCharges: z.number().nonnegative().default(0),
  discountType: z.enum(["flat", "percent"]),
  discountValue: z.number().nonnegative().default(0),
  gstType: z.enum(["none", "intra", "inter"]),
  taxRate: z.number().nonnegative().default(0),
  docStatus: z.enum(["draft", "sent"]).default("draft"),
  terms: z.string().default(""),
  notes: z.string().default(""),
});

/**
 * Create or update a sales invoice.
 *
 * H-3: When editing an existing invoice that already has payments, changing the
 * line items would cause replace_inventory_ledger to wipe and rewrite the stock
 * movements — effectively crediting back stock that was genuinely sold. This
 * route blocks item/total edits after any payment has been recorded.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to manage invoices" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const isEdit = !!fd.id;

  // H-3: Block financial edits on invoices that have payments.
  if (isEdit) {
    const { data: payments } = await supabase
      .from("sales_payments")
      .select("id")
      .eq("invoice_id", fd.id!)
      .limit(1);

    if (payments && payments.length > 0) {
      return NextResponse.json(
        { error: "This invoice has payments recorded against it. Financial details cannot be changed — void and reissue if a correction is needed." },
        { status: 409 }
      );
    }
  }

  // Sequential numbering (Settings > Document Numbering) always overrides whatever the client
  // sent for a brand-new invoice -- the client-side value is only ever a fallback placeholder
  // for when this is disabled. Editing an existing invoice never renumbers it.
  let invoiceNumber = fd.invoiceNumber;
  if (!isEdit) {
    const { data: numberingSetting } = await supabase.from("app_settings").select("value").eq("key", "documentNumbering").maybeSingle();
    const numbering: DocumentNumberingSettings = { ...DEFAULT_DOCUMENT_NUMBERING, ...((numberingSetting?.value as Partial<DocumentNumberingSettings>) || {}) };
    const fmt = numbering.invoice;
    if (fmt.enabled) {
      const year = new Date(fd.invoiceDate).getFullYear();
      const { data: nextNumber, error: seqError } = await supabase.rpc("next_document_number", {
        p_doc_type: "invoice",
        p_period_key: periodKeyFor(fmt, year),
        p_start: fmt.startNumber,
      });
      if (seqError) return NextResponse.json({ error: seqError.message }, { status: 500 });
      invoiceNumber = formatDocNumber(fmt, nextNumber, year);
    }
  }

  const totals = computeInvoiceTotals(
    fd.items as SalesLineItem[],
    fd.shippingCharges,
    fd.discountType as DiscountType,
    fd.discountValue,
    fd.taxRate,
    fd.gstType as GstType
  );

  const { data, error } = await supabase
    .from("sales_invoices")
    .upsert({
      id: fd.id,
      invoice_number: invoiceNumber,
      customer_mobile: fd.customerMobile,
      customer_name: fd.customerName,
      quote_id: fd.quoteId ?? null,
      invoice_date: fd.invoiceDate,
      due_date: fd.dueDate ?? null,
      items: fd.items as never,
      subject: fd.subject.trim(),
      shipping_charges: totals.shippingCharges,
      discount_type: fd.discountType,
      discount_value: fd.discountValue,
      taxable_amount: totals.taxableAmount,
      gst_type: fd.gstType,
      tax_rate: fd.taxRate,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      round_off: totals.roundOff,
      total: totals.total,
      doc_status: fd.docStatus,
      terms: fd.terms.trim(),
      notes: fd.notes.trim(),
      created_by: user.email,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ledgerRows = fd.items
    .filter((i) => i.productId && i.qty > 0)
    .map((i) => ({
      item_type: "product" as const,
      item_id: i.productId!,
      movement: -i.qty,
      note: `Invoice ${invoiceNumber}`,
      created_by: user.email,
    }));

  const { error: ledgerError } = await supabase.rpc("replace_inventory_ledger", {
    p_ref_type: "sale",
    p_ref_id: data.id,
    p_rows: ledgerRows,
  });
  if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: 500 });

  await logAction(supabase, user.email, isEdit ? `Invoice updated: ${invoiceNumber}` : `Invoice created: ${invoiceNumber}`, null, `₹${totals.total}`);
  return NextResponse.json({ ok: true, data });
}
