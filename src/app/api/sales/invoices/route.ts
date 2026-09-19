import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
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

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().min(1),
  date: z.string().min(1),
  note: z.string().optional(),
  posSessionId: z.string().uuid().optional(),
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
  // POS checkout only — lets a sale's invoice, stock ledger, and payment(s) commit as one
  // atomic write (see save_sales_invoice RPC) instead of two separate mutations where a
  // network drop between them could leave stock deducted with no matching payment recorded.
  payments: z.array(paymentSchema).optional(),
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

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

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
    const [{ data: payments, error: paymentsError }, { data: credits, error: creditsError }] = await Promise.all([
      db.from("sales_payments").select("id").eq("invoice_id", fd.id!).limit(1),
      db.from("sales_credit_notes").select("id").eq("invoice_id", fd.id!).limit(1),
    ]);
    // A failed check here must not silently read as "no payments/credits found" — that's
    // exactly the gap this guard exists to close, and it fails toward the dangerous side:
    // an edit sails through as if the invoice were untouched, when the truth is simply unknown.
    if (paymentsError) return NextResponse.json({ error: `Could not verify existing payments: ${paymentsError.message}` }, { status: 500 });
    if (creditsError) return NextResponse.json({ error: `Could not verify existing credit notes: ${creditsError.message}` }, { status: 500 });

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

  // Sequential numbering (Settings > Document Numbering) always overrides whatever the client
  // sent for a brand-new invoice -- the client-side value is only ever a fallback placeholder
  // for when this is disabled. Editing an existing invoice never renumbers it.
  let invoiceNumber = fd.invoiceNumber;
  if (!isEdit) {
    const { data: numberingSetting } = await db.from("app_settings").select("value").eq("key", "documentNumbering").maybeSingle();
    const numbering: DocumentNumberingSettings = { ...DEFAULT_DOCUMENT_NUMBERING, ...((numberingSetting?.value as Partial<DocumentNumberingSettings>) || {}) };
    const fmt = numbering.invoice;
    if (fmt.enabled) {
      const year = new Date(fd.invoiceDate).getFullYear();
      const { data: nextNumber, error: seqError } = await db.rpc("next_document_number", {
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
    const { data: productRows } = await db.from("products").select("id, cost_price").in("id", productIds);
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

  // Invoice upsert + stock ledger replace + quote-acceptance + (for POS) payment rows all
  // happen inside one Postgres transaction via this RPC (see atomic_sales_invoice_save.sql) —
  // previously these were 2-3 separate round-trips from this route, so a failure partway
  // through (e.g. the ledger call failing after the invoice upsert had already committed)
  // left an invoice with a real total but no matching stock movement, or a POS sale with
  // stock deducted but no payment recorded. Either all of this commits, or none of it does.
  const includeLedger = !(!isEdit && fd.skipInventoryEffect);
  const ledgerRows = includeLedger
    ? fd.items
        .filter((i) => i.productId && i.qty > 0)
        .map((i) => ({
          item_type: "product" as const,
          item_id: i.productId!,
          movement: -i.qty,
          note: `Invoice ${invoiceNumber}`,
          created_by: user.email,
        }))
    : null;

  const paymentRows = fd.payments?.length
    ? fd.payments.map((p) => ({
        amount: p.amount,
        method: p.method,
        date: p.date,
        note: p.note ?? "",
        created_by: user.email,
        pos_session_id: p.posSessionId ?? null,
      }))
    : null;

  const { data, error } = await db
    .rpc("save_sales_invoice", {
      p_id: fd.id ?? null,
      p_invoice_number: invoiceNumber,
      p_customer_mobile: fd.customerMobile,
      p_customer_name: fd.customerName,
      p_quote_id: fd.quoteId ?? null,
      p_invoice_date: fd.invoiceDate,
      p_due_date: fd.dueDate ?? null,
      p_items: itemsWithVerifiedCost as never,
      p_subject: fd.subject.trim(),
      p_shipping_charges: totals.shippingCharges,
      p_discount_type: fd.discountType,
      p_discount_value: fd.discountValue,
      p_taxable_amount: totals.taxableAmount,
      p_gst_type: fd.gstType,
      p_tax_rate: fd.taxRate,
      p_cgst: totals.cgst,
      p_sgst: totals.sgst,
      p_igst: totals.igst,
      p_round_off: totals.roundOff,
      p_total: totals.total,
      p_doc_status: fd.docStatus,
      p_terms: fd.terms.trim(),
      p_notes: fd.notes.trim(),
      p_created_by: user.email,
      p_ledger_rows: ledgerRows,
      p_mark_quote_accepted: !isEdit && !!fd.quoteId,
      p_payments: paymentRows,
    })
    .single();
  if (error) {
    // 23505 = unique_violation — specifically the idx_sales_invoices_quote_unique race guard
    // (see the migration) firing when two near-simultaneous "Convert to Invoice" calls target
    // the same quote; everything else is a genuine unexpected failure.
    if (error.code === "23505") {
      return NextResponse.json({ error: "This quotation was already converted to an invoice." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction(supabase, user.email, isEdit ? `Invoice updated: ${invoiceNumber}` : `Invoice created: ${invoiceNumber}`, null, `₹${totals.total}`);
  return NextResponse.json({ ok: true, data });
}
