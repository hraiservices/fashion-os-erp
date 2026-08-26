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
  discountPercent: z.number().min(0).max(100).optional(),
  discountFlat: z.number().nonnegative().optional(),
  // Accepted here only so the shape round-trips — never trusted. costPrice is re-derived
  // server-side from the actual products table below (see costById), since a client-supplied
  // value here would make the margin figure (shown as real profit in the UI) forgeable.
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
  // For backdated/historical invoices (e.g. bulk import from another system) whose stock
  // movement already happened in real life long before this invoice existed in the app —
  // recording it again here would double-decrement whatever's actually on the shelf today.
  // Only honored on CREATE (see isEdit check below); an edit to an existing invoice always
  // reconciles the ledger normally, same as before.
  skipInventoryEffect: z.boolean().default(false),
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

  // H-3: Block financial edits on invoices that have payments OR credit notes. Credit notes
  // were missing here — an invoice with a credit note but zero payments could still be edited,
  // and replace_inventory_ledger's delete-then-reinsert would silently revert the original
  // sale's stock decrement while the credit note's separate restock still stood, netting a
  // stock gain that never actually happened (and letting the edited total drop below what's
  // already been credited).
  if (isEdit) {
    const [{ data: payments }, { data: credits }] = await Promise.all([
      supabase.from("sales_payments").select("id").eq("invoice_id", fd.id!).limit(1),
      supabase.from("sales_credit_notes").select("id").eq("invoice_id", fd.id!).limit(1),
    ]);

    if (payments && payments.length > 0) {
      return NextResponse.json(
        { error: "This invoice has payments recorded against it. Financial details cannot be changed — void and reissue if a correction is needed." },
        { status: 409 }
      );
    }
    if (credits && credits.length > 0) {
      return NextResponse.json(
        { error: "This invoice has credit notes recorded against it. Financial details cannot be changed — void and reissue if a correction is needed." },
        { status: 409 }
      );
    }
  }

  // Converting a quotation to an invoice had no idempotency guard — clicking "Convert to
  // invoice" twice (double-click, or retrying after navigating away before the redirect)
  // created two separate invoices from the same quote, each independently decrementing stock.
  if (!isEdit && fd.quoteId) {
    const { data: existingForQuote } = await supabase.from("sales_invoices").select("id, invoice_number").eq("quote_id", fd.quoteId).limit(1).maybeSingle();
    if (existingForQuote) {
      return NextResponse.json(
        { error: `This quotation was already converted to invoice ${existingForQuote.invoice_number}.` },
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

  // Re-derive costPrice from the real products table rather than trusting whatever the client
  // sent — costPrice drives the profit-margin figure shown as real money in the UI, and a
  // client-computed/-supplied number is forgeable. This is also the actual "snapshot" moment
  // for margin purposes (frozen at save time using real cost, not whatever value the line held
  // client-side since it was added, which could be stale or wrong).
  const productIds = Array.from(new Set(fd.items.map((i) => i.productId).filter((id): id is string => !!id)));
  const costById = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: productRows } = await supabase.from("products").select("id, cost_price").in("id", productIds);
    for (const p of productRows || []) costById.set(p.id, p.cost_price || 0);
  }
  const itemsWithVerifiedCost: SalesLineItem[] = fd.items.map((i) => ({
    ...i,
    costPrice: i.productId ? costById.get(i.productId) ?? 0 : 0,
  })) as SalesLineItem[];

  const totals = computeInvoiceTotals(
    itemsWithVerifiedCost,
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
      items: itemsWithVerifiedCost as never,
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

  if (!(!isEdit && fd.skipInventoryEffect)) {
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
  }

  if (!isEdit && fd.quoteId) {
    await supabase.from("sales_quotations").update({ status: "accepted" }).eq("id", fd.quoteId);
  }

  await logAction(supabase, user.email, isEdit ? `Invoice updated: ${invoiceNumber}` : `Invoice created: ${invoiceNumber}`, null, `₹${totals.total}`);
  return NextResponse.json({ ok: true, data });
}
