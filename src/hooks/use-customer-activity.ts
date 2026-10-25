"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomerActivityEvent } from "@/app/api/customers/[mobile]/activity/route";

interface ActivityPage {
  events: CustomerActivityEvent[];
  hasMore: boolean;
}

/** Simple page-number pagination (not a true cursor) — adequate for a "Load more" button on a
 *  feed that's read far more often than it grows. See the API route for the merge logic. */
export function useCustomerActivity(mobile: string) {
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["customer-activity", mobile, page],
    queryFn: async (): Promise<ActivityPage> => {
      const res = await fetch(`/api/customers/${encodeURIComponent(mobile)}/activity?page=${page}`);
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    enabled: !!mobile,
  });

  // Accumulate pages client-side rather than re-fetching everything on "Load more" — each page
  // query result is cached separately by React Query, so this just reads them back out in order.
  const events: CustomerActivityEvent[] = [];
  for (let p = 0; p <= page; p++) {
    const cached = queryClient.getQueryData<ActivityPage>(["customer-activity", mobile, p]);
    if (cached) events.push(...cached.events);
  }

  return {
    events,
    isLoading: query.isLoading,
    hasMore: query.data?.hasMore ?? false,
    loadMore: () => setPage((p) => p + 1),
  };
}
