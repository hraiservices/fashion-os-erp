import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({
  action: z.enum(["issue", "redeem"]),
  amount: z.number().positive(),
  note: z.string().max(500).optional(),
});

/**
 * Customer credit ledger (supabase/migrations/add_customer_credit_ledger.sql) — a shared prepaid
 * balance usable against either a stitching order or a sales invoice. Only ever called from the
 * Record Payment page: "issue" when a payment's amount received exceeds what was applied to the
 * customer's outstanding rows, "redeem" when staff apply existing credit toward a new payment.
 * Gated on managePayments, same as recording a payment itself.
 */
export async function POST(request: Request, { params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = await params;
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayments) return NextResponse.json({ error: "No permission to manage payments" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { action, amount, note } = parsed.data;

  const { data, error } = await db.rpc(action === "issue" ? "issue_customer_credit" : "redeem_customer_credit", {
    p_mobile: mobile,
    p_amount: amount,
    p_note: note || "",
    p_created_by: user.email,
  });
  if (error) {
    const status = error.message.includes("Insufficient") ? 422 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ balance: data as number });
}
