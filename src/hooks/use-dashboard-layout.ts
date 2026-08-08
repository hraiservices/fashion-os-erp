"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { defaultLayout, reconcileLayout, type WidgetInstance } from "@/lib/dashboard-widgets";

async function fetchLayout(email: string): Promise<WidgetInstance[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("user_dashboard_layout").select("widgets").eq("email", email).maybeSingle();
  if (error) throw error;
  if (!data?.widgets || !Array.isArray(data.widgets) || data.widgets.length === 0) return defaultLayout();
  return reconcileLayout(data.widgets as unknown as WidgetInstance[]);
}

/** Per-user dashboard layout — visible widgets, their order, and any custom cards they built. */
export function useDashboardLayout() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const email = user?.email;

  const query = useQuery({
    queryKey: ["dashboard-layout", email],
    queryFn: () => fetchLayout(email!),
    enabled: !!email,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async (widgets: WidgetInstance[]) => {
      if (!email) throw new Error("Not signed in");
      const supabase = createClient();
      const { error } = await supabase.from("user_dashboard_layout").upsert({ email, widgets: widgets as never });
      if (error) throw error;
      return widgets;
    },
    onSuccess: (widgets) => {
      qc.setQueryData(["dashboard-layout", email], widgets);
    },
  });

  return { widgets: query.data || defaultLayout(), isLoading: query.isLoading, save };
}
