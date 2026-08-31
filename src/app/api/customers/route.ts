import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { customerIdFromMobile } from "@/lib/business-rules";
import { logAction } from "@/lib/logging";
import type { Json } from "@/lib/supabase/database.types";

const bodySchema = z.object({
  name: z.string().min(1),
  mobile: z.string().min(1),
  /** Present when editing an existing customer whose mobile number may have changed. */
  originalMobile: z.string().optional(),
  email: z.string().optional(),
  dob: z.string().optional(),
  anniversary: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional().default(""),
  paymentTerms: z.string().optional(),
  priceListId: z.string().nullable().optional(),
  measurements: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  gstin: z.string().optional(),
  whatsappOptOut: z.boolean().optional(),
});

/**
 * Create/update a customer. Server-side so manageCustomers is enforced (the client hook
 * wrote straight to Supabase, so the permission was UI-only), and so a changed mobile
 * number migrates the customer's identity instead of orphaning their loyalty balance.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageCustomers) return NextResponse.json({ error: "No permission to manage customers" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  // originalMobile is only ever sent by the edit flow (edit-customer-modal.tsx), set to the
  // customer's own current mobile. Every "add new customer" caller (customer-form.tsx, the
  // import wizard, the sales quick-add picker) omits it. Since the customer id is derived
  // deterministically from the mobile number, a create-new call whose mobile happens to
  // already belong to someone else would otherwise upsert straight over that existing
  // customer's profile with no warning. Block it here instead.
  if (!fd.originalMobile) {
    const { data: collision } = await supabase.from("customers").select("name").eq("id", customerIdFromMobile(fd.mobile)).maybeSingle();
    if (collision) {
      return NextResponse.json({ error: `${fd.mobile} already belongs to ${collision.name}. Edit that customer instead of adding a new one.` }, { status: 409 });
    }
  }

  // A changed mobile re-keys the customer (id is 'CUST-' || mobile). Migrate first so the
  // loyalty balance, history and existing orders follow them to the new number.
  if (fd.originalMobile && fd.originalMobile !== fd.mobile) {
    const { error: migrateError } = await supabase.rpc("change_customer_mobile", {
      p_old_mobile: fd.originalMobile,
      p_new_mobile: fd.mobile,
    });
    if (migrateError) {
      if (migrateError.message?.includes("MOBILE_TAKEN")) {
        return NextResponse.json({ error: `Another customer already uses ${fd.mobile}.` }, { status: 409 });
      }
      return NextResponse.json({ error: migrateError.message }, { status: 500 });
    }
    await logAction(supabase, user.email, `📱 Mobile changed: ${fd.originalMobile} → ${fd.mobile} (${fd.name})`);
  }

  // Loyalty columns are deliberately absent — they are only ever moved by the loyalty RPCs.
  const { error } = await supabase.from("customers").upsert({
    id: customerIdFromMobile(fd.mobile),
    name: fd.name,
    mobile: fd.mobile,
    email: fd.email || null,
    dob: fd.dob || null,
    anniversary: fd.anniversary || null,
    address: fd.address || null,
    notes: fd.notes,
    payment_terms: fd.paymentTerms || "due_on_receipt",
    price_list_id: fd.priceListId || null,
    gstin: fd.gstin || "",
    ...(fd.measurements ? { measurements: fd.measurements as Json } : {}),
    ...(fd.tags ? { tags: fd.tags } : {}),
    ...(fd.whatsappOptOut !== undefined ? { whatsapp_opt_out: fd.whatsappOptOut } : {}),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `✏️ Customer profile updated: ${fd.name} (${fd.mobile})`);
  return NextResponse.json({ ok: true });
}
