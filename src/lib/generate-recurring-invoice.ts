import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { computeInvoiceTotals } from "@/lib/invoice-totals";
import { genInvoiceNumber } from "@/lib/sales";
import { advanceRecurringDate, recurringProfileHasEnded, recurringProfileIsDue } from "@/lib/recurring-invoices";
import { istDateString } from "@/lib/ist-date";
import type { RecurringInvoiceProfile } from "@/lib/types";

/**
 * Generates one Draft invoice from a recurring profile and advances its next_run_date —
 * shared by the manual "Generate now" button (browser client, logged-in user) and the
 * cron API route (service-role client, no user session). Same math, same stock-ledger
 * write as a normal manually-created invoice (lib/invoice-totals.ts + inventory_ledger).
 *
 * The due/active check lives here, not just at the cron route's own pre-filter, because the
 * manual "Generate now" button called this directly with no such check at all — its own
 * button was only ever disabled while a request was in flight or the profile had fully ended,
 * never while merely "not due yet" or paused. That let a not-yet-due (or paused) profile be
 * fired a second time for the same billing period, double-generating an invoice (and
 * double-decrementing stock) for it.
 */
export async function generateInvoiceFromProfile(
  supabase: SupabaseClient<Database>,
  profile: RecurringInvoiceProfile,
  userEmail?: string | null
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  if (!recurringProfileIsDue(profile)) {
    throw new Error(profile.active ? "This profile isn't due to generate an invoice yet." : "This profile is paused and can't generate invoices.");
  }

  const totals = computeInvoiceTotals(profile.items, profile.shippingCharges, profile.discountType, profile.discountValue, profile.taxRate, profile.gstType);
  const invoiceNumber = genInvoiceNumber();
  const today = istDateString();

  const { data, error } = await supabase
    .from("sales_invoices")
    .insert({
      invoice_number: invoiceNumber,
      customer_mobile: profile.customerMobile,
      customer_name: profile.customerName,
      invoice_date: today,
      items: profile.items as never,
      subject: profile.subject,
      shipping_charges: totals.shippingCharges,
      discount_type: profile.discountType,
      discount_value: profile.discountValue,
      taxable_amount: totals.taxableAmount,
      gst_type: profile.gstType,
      tax_rate: profile.taxRate,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      round_off: totals.roundOff,
      total: totals.total,
      doc_status: "draft",
      terms: profile.terms,
      notes: profile.notes,
      created_by: userEmail || null,
    })
    .select()
    .single();
  if (error) throw error;

  const ledgerRows = profile.items
    .filter((i) => i.productId && i.qty > 0)
    .map((i) => ({
      item_type: "product" as const,
      item_id: i.productId,
      movement: -i.qty,
      ref_type: "sale" as const,
      ref_id: data.id,
      note: `Recurring invoice ${invoiceNumber} (${profile.name})`,
      created_by: userEmail || null,
    }));
  if (ledgerRows.length) {
    const { error: ledgerError } = await supabase.from("inventory_ledger").insert(ledgerRows);
    if (ledgerError) throw ledgerError;
  }

  const nextRunDate = advanceRecurringDate(profile.nextRunDate, profile.frequency);
  const occurrencesGenerated = profile.occurrencesGenerated + 1;
  const ended = recurringProfileHasEnded({ ...profile, nextRunDate, occurrencesGenerated });

  // The advance is conditional on next_run_date still being what we read, and its error and
  // row count are both checked. Two callers can race here — the daily cron and the "Generate
  // now" button each load the profile, then act — and an unconditional, unchecked update let
  // both pass the due-check, both insert an invoice and both advance the row: the customer was
  // billed twice for one period and stock was decremented twice. A failed update was worse
  // still, since the route reported success and the next cron run billed the same period
  // again. If this matches no rows, someone else already generated this period; the invoice we
  // just inserted is the duplicate, so it and its stock movements are rolled back by hand
  // (there is no transaction across these calls) and the caller is told.
  const { data: advanced, error: advanceError } = await supabase
    .from("recurring_invoice_profiles")
    .update({
      next_run_date: nextRunDate,
      occurrences_generated: occurrencesGenerated,
      last_generated_at: new Date().toISOString(),
      active: ended ? false : profile.active,
    })
    .eq("id", profile.id)
    .eq("next_run_date", profile.nextRunDate)
    .select("id");
  if (advanceError || !advanced || advanced.length === 0) {
    await supabase.from("inventory_ledger").delete().eq("ref_type", "sale").eq("ref_id", data.id);
    await supabase.from("sales_invoices").delete().eq("id", data.id);
    throw new Error(
      advanceError
        ? `Couldn't advance the recurring profile, so the invoice was rolled back — ${advanceError.message}`
        : "This period's invoice had already been generated, so the duplicate was rolled back."
    );
  }

  return { invoiceId: data.id, invoiceNumber };
}
