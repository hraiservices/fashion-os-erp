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
