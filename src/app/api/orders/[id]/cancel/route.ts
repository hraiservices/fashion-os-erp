import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  reason: z.string().min(1, "A cancellation reason is required").max(500),
});

/**
 * Void a stitching order without destroying it.
 *
 * Until this existed the only way to take a cancelled order out of the books was to delete it,
 * which threw away the record that the order had ever been taken — an ERP should never make
 * correcting a figure and losing its history the same action. A cancelled order keeps its id,
 * its history, its payments and its audit trail; it simply stops counting as revenue, stops
 * appearing as a receivable, and leaves the work pipeline.
 *
 * Gated on deleteOrder rather than editOrder: this is the destructive-intent action of the two,
 * and anyone trusted to delete an order is trusted to void one. Uses the service client because
 * `orders` writes are revoked from `authenticated` (lockdown_operational_writes.sql).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.deleteOrder) return NextResponse.json({ error: "No permission to cancel orders" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const reason = parsed.data.reason.trim();

  const { data: order, error: readError } = await db
    .from("orders")
    .select("id, advance, cancelled_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.cancelled_at) return NextResponse.json({ error: "This order is already cancelled" }, { status: 409 });

  // Money already taken is a refund decision, not a side effect of voiding the paperwork. Block
  // the cancel rather than silently stranding a paid-up order outside every report that would
  // otherwise show the shop still holds the customer's money.
  if ((order.advance || 0) > 0) {
    return NextResponse.json(
      { error: "This order has payments recorded against it. Refund or delete those payments first, then cancel." },
      { status: 409 }
    );
  }

  const { error } = await db
    .from("orders")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: user.email, cancel_reason: reason })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Order cancelled: ${id}`, id, reason);
  return NextResponse.json({ ok: true });
}
