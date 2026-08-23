import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * awardLoyaltyPoints(), line ~17284. Delegates to the award_loyalty_points Postgres
 * function (supabase/award_loyalty_points.sql) which serializes concurrent awards for
 * the same customer via a row lock — replacing the old client-side promise-queue guard.
 */
export async function awardLoyaltyPoints(
  supabase: SupabaseClient<Database>,
  mobile: string,
  name: string,
  pts: number,
  type: "earn" | "redeem" | "delivery" | "manual" | "payment_bonus" | "referral",
  orderId: string | null,
  note: string
): Promise<void> {
  if (!pts || !mobile) return;
  const { error } = await supabase.rpc("award_loyalty_points", {
    p_mobile: mobile,
    p_name: name,
    p_pts: pts,
    p_type: type,
    p_order_id: orderId,
    p_note: note,
  });
  if (error) throw new Error(`Loyalty award failed: ${error.message}`);
}
