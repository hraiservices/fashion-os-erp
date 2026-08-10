"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { MobileTabBar } from "@/components/app-shell/mobile-nav";
import { ExpiryBanner } from "@/components/app-shell/expiry-banner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { RESTRICTED_FALLBACK_ROUTE, isRestrictedRoute } from "@/lib/permissions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user } = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();

  // Mirrors the old app's `_isRestrictedRole && _RESTRICTED_TABS.indexOf(tab) !== -1` guard
  // (line ~17686): a restricted role landing on a hidden route is bounced to Orders.
  useEffect(() => {
    if (user?.restricted && isRestrictedRoute(pathname)) {
      router.replace(RESTRICTED_FALLBACK_ROUTE);
    }
  }, [user, pathname, router]);

  return (
    <div className="flex min-h-dvh flex-1 bg-muted/20 print:block print:bg-white">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <div className="print:hidden">
          <Topbar />
        </div>
        <ExpiryBanner />
        {/* pb-24 on mobile keeps content clear of the fixed bottom tab bar. */}
        <main className="flex-1 pb-24 lg:pb-0 print:pb-0">{children}</main>
      </div>
      <div className="print:hidden">
        <MobileTabBar />
      </div>
    </div>
  );
}
