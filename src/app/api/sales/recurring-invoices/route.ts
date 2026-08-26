import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

const lineItemSchema = z.object({
  productId: z.string().nullable().optional(),
  productName: z.string(),
  qty: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  discountType: z.enum(["flat", "percent"]).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  discountFlat: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  amount: z.number().nonnegative(),
});

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  customerMobile: z.string().min(1),
  customerName: z.string().default(""),
  items: z.array(lineItemSchema),
  subject: z.string().default(""),
  shippingCharges: z.number().default(0),
  discountType: z.enum(["flat", "percent"]),
  discountValue: z.number().default(0),
  gstType: z.enum(["none", "intra", "inter"]),
  taxRate: z.number(),
  terms: z.string().default(""),
  notes: z.string().default(""),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextRunDate: z.string().min(1),
  endType: z.enum(["never", "on_date", "after_count"]),
  endDate: z.string().nullable().optional(),
  endAfterCount: z.number().nullable().optional(),
});

/** Create/update a recurring-invoice profile. Previously ran entirely client-side with no
 *  permission check — any authenticated user could create/edit the exact profiles the
 *  CRON_SECRET-gated generator route later auto-invoices from. */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to manage recurring invoices" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const isNew = !fd.id;

  const { data, error } = await supabase
    .from("recurring_invoice_profiles")
    .upsert({
      id: fd.id,
      name: fd.name,
      customer_mobile: fd.customerMobile,
      customer_name: fd.customerName,
      items: fd.items as never,
      subject: fd.subject,
      shipping_charges: fd.shippingCharges,
      discount_type: fd.discountType,
      discount_value: fd.discountValue,
      gst_type: fd.gstType,
      tax_rate: fd.taxRate,
      terms: fd.terms,
      notes: fd.notes,
      frequency: fd.frequency,
      next_run_date: fd.nextRunDate,
      end_type: fd.endType,
      end_date: fd.endDate,
      end_after_count: fd.endAfterCount,
      created_by: user.email,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, isNew ? `Recurring invoice profile created: ${fd.name}` : `Recurring invoice profile updated: ${fd.name}`);
  return NextResponse.json({ profile: data });
}
