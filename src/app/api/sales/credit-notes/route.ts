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

  // H-2: Guard — total credits issued must not exceed the original invoice amount.
  const { data: invoice } = await supabase
    .from("sales_invoices")
    .select("total")
    .eq("id", fd.invoiceId)
    .single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { data: existingCredits } = await supabase
    .from("sales_credit_notes")
    .select("total")
    .eq("invoice_id", fd.invoiceId);

  const creditedSoFar = (existingCredits || []).reduce((s, c) => s + (c.total || 0), 0);
  const maxAllowed = invoice.total - creditedSoFar;

  if (total > maxAllowed + 0.01) {
    return NextResponse.json(
      { error: `Credit note of ₹${total} exceeds the creditable balance of ₹${maxAllowed.toFixed(2)} (invoice ₹${invoice.total} minus ₹${creditedSoFar} already credited)` },
      { status: 422 }
    );
  }

  const { data: creditNote, error } = await supabase
    .from("sales_credit_notes")
    .insert({
      credit_number: fd.creditNumber,
      invoice_id: fd.invoiceId,
      customer_mobile: fd.customerMobile,
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

  const ledgerRows = fd.items
    .filter((i) => i.productId && i.qty > 0)
    .map((i) => ({
      item_type: "product" as const,
      item_id: i.productId!,
      movement: i.qty,
      ref_type: "sale_return" as const,
      ref_id: creditNote.id,
      note: `Return against invoice ${fd.invoiceNumber}`,
      created_by: user.email,
    }));

  if (ledgerRows.length) {
    const { error: ledgerError } = await supabase.from("inventory_ledger").insert(ledgerRows);
    if (ledgerError) {
      // Compensating: delete the credit note we just created
      await supabase.from("sales_credit_notes").delete().eq("id", creditNote.id);
      return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    }
  }

  await logAction(supabase, user.email, `Credit note raised: ${fd.creditNumber} (₹${total}) against invoice ${fd.invoiceNumber}`);
  return NextResponse.json({ ok: true, id: creditNote.id });
}
