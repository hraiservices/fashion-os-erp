import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { computeInvoiceTotals } from "@/lib/invoice-totals";
import { genInvoiceNumber } from "@/lib/sales";
import { advanceRecurringDate, recurringProfileHasEnded } from "@/lib/recurring-invoices";
import type { RecurringInvoiceProfile } from "@/lib/types";

/**
 * Generates one Draft invoice from a recurring profile and advances its next_run_date —
 * shared by the manual "Generate now" button (browser client, logged-in user) and the
 * cron API route (service-role client, no user session). Same math, same stock-ledger
 * write as a normal manually-created invoice (lib/invoice-totals.ts + inventory_ledger).
 */
export async function generateInvoiceFromProfile(
  supabase: SupabaseClient<Database>,
  profile: RecurringInvoiceProfile,
  userEmail?: string | null
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const totals = computeInvoiceTotals(profile.items, profile.shippingCharges, profile.discountType, profile.discountValue, profile.taxRate, profile.gstType);
  const invoiceNumber = genInvoiceNumber();
  const today = new Date().toISOString().slice(0, 10);

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

  await supabase
    .from("recurring_invoice_profiles")
    .update({
      next_run_date: nextRunDate,
      occurrences_generated: occurrencesGenerated,
      last_generated_at: new Date().toISOString(),
      active: ended ? false : profile.active,
    })
    .eq("id", profile.id);

  return { invoiceId: data.id, invoiceNumber };
}
