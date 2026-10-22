import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { upcomingOccasions, type Occasion } from "@/lib/occasions";
import { addDaysIso } from "@/lib/work-tasks";

/** Customers with a birthday or anniversary in the next 7 days. */
export function useUpcomingOccasions(today: string, enabled: boolean) {
  return useQuery({
    queryKey: ["customer-occasions", today],
    enabled: enabled && !!today,
    queryFn: async (): Promise<Occasion[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("customers").select("name, mobile, dob, anniversary").or("dob.not.is.null,anniversary.not.is.null").limit(3000);
      if (error || !data) return [];
      return upcomingOccasions(data, today, 7);
    },
    staleTime: 60 * 60_000,
  });
}

export interface ReviewCandidate {
  id: string;
  name: string;
  mobile: string;
  deliveryDate: string;
}

/** Orders delivered 2–10 days ago — a good moment to ask for a review. */
export function useReviewCandidates(today: string, enabled: boolean) {
  return useQuery({
    queryKey: ["review-candidates", today],
    enabled: enabled && !!today,
    queryFn: async (): Promise<ReviewCandidate[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("orders")
        .select("id, name, mobile, delivery_date")
        .in("status", ["delivered", "payment"])
        .gte("delivery_date", addDaysIso(today, -10))
        .lte("delivery_date", addDaysIso(today, -2))
        .order("delivery_date", { ascending: false })
        .limit(60);
      if (error || !data) return [];
      // One ask per customer, even if they had several orders.
      const seen = new Set<string>();
      return data.filter((o) => (seen.has(o.mobile) ? false : (seen.add(o.mobile), true))).map((o) => ({ id: o.id, name: o.name, mobile: o.mobile, deliveryDate: o.delivery_date }));
    },
    staleTime: 30 * 60_000,
  });
}

export interface ReferralCandidate {
  id: string;
  name: string;
  mobile: string;
  deliveryDate: string;
}

/** Same delivered-2-10-days-ago window as review candidates — a happy, recently-delivered
 *  customer is also the right moment to nudge them to refer a friend. */
export function useReferralCandidates(today: string, enabled: boolean) {
  return useQuery({
    queryKey: ["referral-candidates", today],
    enabled: enabled && !!today,
    queryFn: async (): Promise<ReferralCandidate[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("orders")
        .select("id, name, mobile, delivery_date")
        .in("status", ["delivered", "payment"])
        .gte("delivery_date", addDaysIso(today, -10))
        .lte("delivery_date", addDaysIso(today, -2))
        .order("delivery_date", { ascending: false })
        .limit(60);
      if (error || !data) return [];
      const seen = new Set<string>();
      return data.filter((o) => (seen.has(o.mobile) ? false : (seen.add(o.mobile), true))).map((o) => ({ id: o.id, name: o.name, mobile: o.mobile, deliveryDate: o.delivery_date }));
    },
    staleTime: 30 * 60_000,
  });
}
