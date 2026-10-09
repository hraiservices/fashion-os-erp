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
            // This app is money-critical: reports and pages read live balances that other
            // screens (or another device/tab) can change seconds earlier — deleting a payment,
            // recording one, editing an order. Relying on every single mutation to remember to
            // invalidate every report's query key is exactly the fragile pattern that kept
            // producing "stale until I hard-refresh" bugs (Day Book showing a deleted payment's
            // total, the order Payments list not updating, etc.) — one missed invalidation
            // anywhere and a screen silently lies about money. Instead, always revalidate
            // in the background whenever a screen is (re)mounted or the tab regains focus;
            // staleTime above still avoids duplicate refetches within a single active view.
            refetchOnMount: "always",
            refetchOnWindowFocus: true,
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
