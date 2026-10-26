"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { FontLoader } from "@/components/app-shell/font-loader";
import { ColorThemeLoader } from "@/components/app-shell/color-theme-loader";
import { DefaultThemeLoader } from "@/components/app-shell/default-theme-loader";
import { ThemeColorSync } from "@/components/app-shell/theme-color-sync";
import { KeyboardAvoidance } from "@/components/app-shell/keyboard-avoidance";
import { NativeBackButton } from "@/components/app-shell/native-back-button";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Was `refetchOnMount: "always"` globally — applied to every query in the app
            // (products, customers, dashboard widgets, everything), not just the money-critical
            // ones it was meant for. On a mobile-first app where staff switch apps constantly,
            // that forced a full re-fetch of every mounted query on every single screen visit
            // and every tab refocus regardless of staleTime, which is what actually blew past
            // the Supabase egress/log-ingestion quota (288% / 128% over) — not big files
            // (Storage Size stayed ~20MB the whole period), just the same small queries re-run
            // far more often than the data could possibly have changed.
            //
            // Back to the normal default here (refetch only once staleTime above has elapsed).
            // The specific screens that genuinely need "another tab/device may have changed this
            // in the last few seconds" (Day Book, cash closing history) opt back into
            // `refetchOnMount: "always"` individually — see src/hooks/use-day-book.ts — instead
            // of every query in the app paying that cost by default.
            // React Query's default (3 retries, delay doubling up to 30s) was built for a
            // desktop tab left open in the background, not the first query of a cold app open on
            // a phone's mobile radio — a single transient failure (a 5G tower handoff, a dropped
            // packet) sat silently backing off for up to ~7s before the UI showed anything,
            // directly on the critical path every protected page waits on (useCurrentUser's own
            // getUser() + get_current_user_context() chain, see src/hooks/use-current-user.ts).
            // Capped lower so a real blip still gets one quick auto-retry instead of none, but
            // never silently hangs for several seconds doing it.
            retry: 2,
            retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2_000),
          },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <FontLoader />
          <ColorThemeLoader />
          <DefaultThemeLoader />
          <ThemeColorSync />
          <KeyboardAvoidance />
          <NativeBackButton />
          {children}
          <Toaster richColors position="top-center" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
