"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { AppFooter } from "@/components/app-shell/app-footer";
import { MobileTabBar } from "@/components/app-shell/mobile-nav";
import { ExpiryBanner } from "@/components/app-shell/expiry-banner";
import { OfflineBanner } from "@/components/app-shell/offline-banner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePresenceHeartbeat } from "@/hooks/use-presence";
import { RESTRICTED_FALLBACK_ROUTE, isRestrictedRoute } from "@/lib/permissions";
import { CopilotBubble } from "@/components/app-shell/copilot-bubble";
import { CopilotOpenProvider } from "@/components/app-shell/copilot-context";
import { UtilityRail, useUtilityRailCollapsed } from "@/components/app-shell/utility-rail";
import { cn } from "@/lib/utils";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading: userLoading, isFetched: userFetched } = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed: railCollapsed, toggle: toggleRail } = useUtilityRailCollapsed();
  usePresenceHeartbeat(!!user);

  // useCurrentUser() resolves to `null` (not an error) once the session is gone — an expired
  // Supabase cookie, a token revoked from another device — so every page under here was
  // rendering through with `user` just silently undefined: permission checks hid buttons one by
  // one, but nothing ever told the person why their screen suddenly looked broken or sent them
  // back to sign in. isFetched (not just !isLoading) gates this so it only fires once the query
  // has actually settled at least once, never on the first render before data exists yet.
  useEffect(() => {
    if (userFetched && !userLoading && user === null) {
      toast.error("Your session has expired — please sign in again.");
      router.replace("/login");
    }
  }, [userFetched, userLoading, user, router]);

  // Mirrors the old app's `_isRestrictedRole && _RESTRICTED_TABS.indexOf(tab) !== -1` guard
  // (line ~17686): a restricted role landing on a hidden route is bounced to Orders.
  //
  // A non-restricted role (admin/manager) with viewReports explicitly turned off is a separate
  // case from the above: the Reports nav group already hides itself for that user (see
  // nav-content.tsx), but hiding the link was the ONLY thing stopping them before this — typing
  // a /reports/* URL directly still rendered every report page's data, since none of them (bar
  // one) actually check the permission themselves. This closes that gap at the route level
  // instead of auditing every report page individually.
  useEffect(() => {
    if (user?.restricted && isRestrictedRoute(pathname)) {
      router.replace(RESTRICTED_FALLBACK_ROUTE);
    } else if (user && !user.perms.viewReports && (pathname === "/reports" || pathname.startsWith("/reports/"))) {
      router.replace(RESTRICTED_FALLBACK_ROUTE);
    }
  }, [user, pathname, router]);

  return (
    // CopilotOpenProvider has to wrap Topbar too, not just the bottom-bar section: Topbar
    // renders MobileNavTrigger, which also reads useCopilotOpen() (the hamburger drawer's
    // Copilot entry, for roles that don't get it in the bottom bar). With the provider scoped
    // to only MobileTabBar/CopilotBubble, Topbar rendered as a sibling outside it and
    // MobileNavTrigger threw "useCopilotOpen must be used within a CopilotOpenProvider" on
    // every single page — which Next's static prerendering surfaces as a hard build failure,
    // so no deploy since this was introduced actually shipped.
    <CopilotOpenProvider>
      <div className="flex min-h-screen min-h-dvh shrink-0 grow basis-auto bg-muted/20 print:block print:bg-white">
        <div className="print:hidden">
          <Sidebar />
        </div>
        {/* lg:pr-14 reserves the same 56px the utility rail itself occupies when expanded, so
            it displaces page content instead of floating over whatever sits at the right edge
            (table action columns, scrollbars, etc.) — dropped once the rail is collapsed. */}
        <div className={cn("flex min-w-0 flex-1 flex-col print:block", !railCollapsed && "lg:pr-14")}>
          <div className="print:hidden">
            <Topbar />
          </div>
          <OfflineBanner />
          <ExpiryBanner />
          {/* pb-24 on mobile keeps content clear of the fixed bottom tab bar. */}
          <main className="flex-1 pb-24 lg:pb-0 print:pb-0">{children}</main>
          <AppFooter />
        </div>
        <div className="print:hidden">
          <MobileTabBar />
        </div>
        <CopilotBubble />
        <UtilityRail collapsed={railCollapsed} onToggleCollapsed={toggleRail} />
      </div>
    </CopilotOpenProvider>
  );
}
