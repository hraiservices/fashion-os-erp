"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapReferralCouponRow } from "@/lib/types";
import type { ReferralCoupon } from "@/lib/types";

async function fetchReferralCoupons() {
  const supabase = createClient();
  const { data, error } = await supabase.from("referral_coupons").select("*").order("issued_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapReferralCouponRow);
}

export function useReferralCoupons() {
  return useQuery({
    queryKey: ["referral-coupons"],
    queryFn: fetchReferralCoupons,
    staleTime: 30_000,
  });
}

async function postJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/** Issues a new referral coupon tied to a customer — see /api/customers/[mobile]/referral-coupon. */
export function useIssueReferralCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mobile: string) => postJson<{ coupon: ReferralCoupon }>(`/api/customers/${encodeURIComponent(mobile)}/referral-coupon`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referral-coupons"] }),
  });
}
