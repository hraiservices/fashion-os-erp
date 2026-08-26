import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateInvoiceFromProfile } from "@/lib/generate-recurring-invoice";
import { recurringProfileIsDue } from "@/lib/recurring-invoices";
import { istDateString } from "@/lib/ist-date";
import { mapRecurringInvoiceProfileRow } from "@/lib/types";

/**
 * Cron entry point — hit daily by vercel.json's schedule. Runs with no logged-in user
 * (Vercel Cron calls it directly), so it needs the service-role client, gated by CRON_SECRET
 * so nobody else can trigger mass invoice generation with just the public anon key.
 * Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when that env var is set.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured — recurring invoices can still be generated manually from the Sales > Recurring Invoices page." }, { status: 501 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured — recurring invoices can still be generated manually from the Sales > Recurring Invoices page." }, { status: 501 });
  }

  const { data: rows, error } = await supabase.from("recurring_invoice_profiles").select("*").eq("active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = istDateString();
  const dueProfiles = (rows || []).map(mapRecurringInvoiceProfileRow).filter((p) => recurringProfileIsDue(p, today));

  const results: { profileId: string; invoiceNumber?: string; error?: string }[] = [];
  for (const profile of dueProfiles) {
    try {
      const result = await generateInvoiceFromProfile(supabase, profile, null);
      results.push({ profileId: profile.id, invoiceNumber: result.invoiceNumber });
    } catch (e) {
      results.push({ profileId: profile.id, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return NextResponse.json({ checked: rows?.length || 0, due: dueProfiles.length, generated: results.filter((r) => r.invoiceNumber).length, results });
}
