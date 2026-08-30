import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";
import { computeLineItemsTotal, type SalesLineItem } from "@/lib/sales";

const lineItemSchema = z.object({
  productId: z.string().nullable().optional(),
  productName: z.string(),
  qty: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  amount: z.number().nonnegative(),
});

const bodySchema = z.object({
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  customerMobile: z.string().min(1),
  creditNumber: z.string().min(1),
  date: z.string().min(1),
  items: z.array(lineItemSchema).min(1),
  reason: z.string(),
  notes: z.string().default(""),
});

/**
 * Raise a credit note against a sales invoice.
 *
 * Previously this ran client-side with no permission check and no limit on the
 * credit amount — a user could raise a credit note larger than the original
 * invoice, minting phantom positive balance (free credit) and generating
 * phantom stock restocks that never actually happened.
 *
 * All of the validation (aggregate ₹ cap, per-product invoiced-quantity cap) plus the credit
 * note insert and its inventory_ledger restock now happen inside record_sales_credit_note() —
 * one SELECT ... FOR UPDATE-locked transaction, not a separate read-then-insert followed by a
 * best-effort compensating delete. Two near-simultaneous credit notes against the same invoice
 * used to both read the same "credited so far" and both pass, together over-crediting the
 * invoice and double-restocking the same returned units.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to raise credit notes" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const total = computeLineItemsTotal(fd.items as SalesLineItem[]);
  if (total <= 0) return NextResponse.json({ error: "Add at least one returned item" }, { status: 400 });

  const { data: creditId, error } = await supabase.rpc("record_sales_credit_note", {
    p_invoice_id: fd.invoiceId,
    p_invoice_number: fd.invoiceNumber,
    p_credit_number: fd.creditNumber,
    p_customer_mobile: fd.customerMobile,
    p_date: fd.date,
    p_items: fd.items as never,
    p_total: total,
    p_reason: fd.reason.trim(),
    p_notes: fd.notes.trim(),
    p_created_by: user.email,
  });
  if (error) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("exceeds") || error.message.includes("Cannot return") ? 422 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  await logAction(supabase, user.email, `Credit note raised: ${fd.creditNumber} (₹${total}) against invoice ${fd.invoiceNumber}`);
  return NextResponse.json({ ok: true, id: creditId });
}
