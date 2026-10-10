import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, notFound, serverError } from "@/lib/targets-api";
import { ensureCustomerForLead, leadVisible, targetsContext } from "@/lib/targets-server";

/**
 * POST — get a lead ready for an order or invoice: links it to a Customer (creating one only if
 * none exists for that number) and returns the prefilled links. The order/invoice routes then
 * stamp the lead onto the new record, which is what credits the sale to the lead's owner.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const { data: row } = await db.from("leads").select("*").eq("id", id).maybeSingle();
  if (!row || !leadVisible(row, ctx)) return notFound("Lead not found");
  if (!row.mobile) return badRequest("Add the person's mobile number first — orders and invoices need it");

  try {
    const customerId = await ensureCustomerForLead(db, { name: row.name, mobile: row.mobile });
    if (customerId && customerId !== row.customer_id) await db.from("leads").update({ customer_id: customerId }).eq("id", id);
    const qs = new URLSearchParams({ leadId: id, mobile: row.mobile, name: row.name });
    return NextResponse.json({
      ok: true,
      customerId,
      orderUrl: `/orders/new?${qs.toString()}`,
      invoiceUrl: `/sales/invoices/new?${new URLSearchParams({ leadId: id, mobile: row.mobile }).toString()}`,
    });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Couldn't link the customer");
  }
}
