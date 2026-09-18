import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { generateInvoiceFromProfile } from "@/lib/generate-recurring-invoice";
import { mapRecurringInvoiceProfileRow } from "@/lib/types";

/**
 * Manual "Generate now" trigger. Previously ran entirely client-side with no permission check
 * and trusted whatever profile object the browser already had in memory (stale after another
 * tab/user changed it). Now re-fetches the current row server-side, and
 * generateInvoiceFromProfile() itself now refuses to run for a profile that isn't due yet or
 * is paused (see that function's comment) — this route no longer needs its own due/active
 * check, it just surfaces whatever error that function raises.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to manage recurring invoices" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: row } = await supabase.from("recurring_invoice_profiles").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  const profile = mapRecurringInvoiceProfileRow(row);

  try {
    const result = await generateInvoiceFromProfile(db, profile, user.email);
    await logAction(supabase, user.email, `Recurring invoice generated: ${result.invoiceNumber} (from profile ${profile.name})`);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to generate invoice" }, { status: 422 });
  }
}
