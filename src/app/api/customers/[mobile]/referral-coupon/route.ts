import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapReferralCouponRow } from "@/lib/types";
import { REFERRAL_COUPON_DISCOUNT, REFERRAL_COUPON_VALIDITY_DAYS } from "@/lib/business-rules";
import { logAction } from "@/lib/logging";

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids misread codes on a printed coupon
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `REF-${suffix}`;
}

/** Issues a referral coupon tied to this customer — staff clicks "Give referral coupon" on the
 *  CRM page and the printable coupon opens immediately, per the confirmed on-demand flow. */
export async function POST(_request: Request, { params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageCustomers) return NextResponse.json({ error: "No permission to manage customers" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: customer } = await db.from("customers").select("name, mobile").eq("mobile", mobile).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const expiresAt = new Date(Date.now() + REFERRAL_COUPON_VALIDITY_DAYS * 86400000).toISOString();

  // Retry a handful of times on the rare unique-constraint collision rather than failing outright.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { data, error } = await db
      .from("referral_coupons")
      .insert({
        code,
        referrer_mobile: customer.mobile,
        referrer_name: customer.name || "",
        discount_amount: REFERRAL_COUPON_DISCOUNT,
        expires_at: expiresAt,
        created_by: user.email,
      })
      .select("*")
      .single();
    if (!error && data) {
      await logAction(supabase, user.email, `🎟️ Referral coupon issued: ${code}`, undefined, `Referrer: ${customer.name}`);
      return NextResponse.json({ coupon: mapReferralCouponRow(data) });
    }
    if (error && !error.message.includes("duplicate key")) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Could not generate a unique coupon code — try again" }, { status: 500 });
}
