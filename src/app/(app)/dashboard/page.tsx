"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Scissors, UserPlus, ClipboardList, Receipt, Settings2, Check, Wallet } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isWidgetEnabled } from "@/lib/entitlements";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NewPaymentButton } from "@/components/payments/new-payment-button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import { CustomizePanel } from "@/components/dashboard/customize-panel";
import { GettingStartedTab } from "@/components/dashboard/getting-started-tab";
import { RecentUpdatesTab } from "@/components/dashboard/recent-updates-tab";
import { GetSupportTab } from "@/components/dashboard/get-support-tab";
import { DigitalClock } from "@/components/dashboard/digital-clock";
import { LiveUsersCard } from "@/components/dashboard/live-users-card";
import { isWidgetVisibleForRole, type WidgetInstance } from "@/lib/dashboard-widgets";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_CARD_HEADER_BG_CONFIG, cardHeaderBgDarkOpacity, cardHeaderBgOpacity, resolveCardHeaderBgUrl, type CardHeaderBgConfig } from "@/lib/card-header-bg";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type DashboardTab = "dashboard" | "getting-started" | "recent-updates" | "get-support";

const MOBILE_TABS: { value: DashboardTab; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "getting-started", label: "Getting Started" },
  { value: "recent-updates", label: "Updates" },
  { value: "get-support", label: "Support" },
];

export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const { data: bgCfg } = useAppSetting<CardHeaderBgConfig>("cardHeaderBg", DEFAULT_CARD_HEADER_BG_CONFIG);
  const headerBg = bgCfg ?? DEFAULT_CARD_HEADER_BG_CONFIG;
  const { data: shop } = useShopSettings();
  const { widgets: savedWidgets, rawData: layoutRawData, isLoading: layoutLoading, save } = useDashboardLayout();
  const { data: entitlements, isLoading: entitlementsLoading } = useModuleEntitlements();
  const queryClient = useQueryClient();

  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [tab, setTab] = useState<DashboardTab>("dashboard");

  // Re-fetches everything the dashboard's own hooks feed from, rather than one specific query
  // key — the page pulls from several independent sources (layout, entitlements, each widget's
  // own query) with no single key that covers all of them.
  const {
    containerRef: ptrContainerRef,
    pull: ptrPull,
    refreshing: ptrRefreshing,
    threshold: ptrThreshold,
    onTouchStart: ptrOnTouchStart,
    onTouchMove: ptrOnTouchMove,
    onTouchEnd: ptrOnTouchEnd,
  } = usePullToRefresh(() => queryClient.invalidateQueries());

  // Guard on layoutRawData (the actual fetched array, not the defaultLayout() fallback) so this
  // only locks once real data arrives. Without this, entitlements arriving from cache before the
  // user/email resolves would fire against the defaultLayout() fallback, permanently locking out
  // the real fetched layout on client-side navigation.
  useSyncFromSource(layoutRawData !== undefined && entitlements ? savedWidgets : null, (saved) => {
    if (!saved || initialized) return;
    setWidgets(saved.filter((w) => w.kind === "custom" || isWidgetEnabled(entitlements!, w.builtinKey!)));
    setInitialized(true);
  });

  function handleChange(next: WidgetInstance[]) {
    setWidgets(next);
    save.mutate(next, { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save layout") });
  }

  // Role-restricted builtins (e.g. Profit Overview — admin/manager only) are filtered out here
  // rather than baked into the saved layout itself, so a role change takes effect immediately
  // without needing to touch anyone's stored widget list. Profit Overview additionally needs
  // viewFinancialReports specifically — it links straight to /reports/combined-pl, so a manager
  // without that permission shouldn't see the same profit figures via a dashboard back door.
  const roleVisibleWidgets = widgets.filter(
    (w) =>
      w.kind === "custom" ||
      (isWidgetVisibleForRole(w.builtinKey, user?.role) && (w.builtinKey !== "profit-overview" || !!user?.perms.viewFinancialReports))
  );

  return (
    <div
      ref={ptrContainerRef}
      onTouchStart={ptrOnTouchStart}
      onTouchMove={ptrOnTouchMove}
      onTouchEnd={ptrOnTouchEnd}
      // pb-16 (on top of the app shell's own pb-24 for the global bottom nav) clears this
      // page's own mobile tab bar below — see MOBILE_TABS. sm:py-6 restores the plain p-6
      // on all sides that bar doesn't exist at that breakpoint.
      className="space-y-5 px-4 pt-4 pb-16 sm:px-6 sm:py-6"
    >
      {/* Pull-to-refresh indicator — only ever visible while actively dragging past the top on
       *  mobile (see usePullToRefresh); desktop never fires the touch events that drive `pull`. */}
      <div
        className="flex items-center justify-center overflow-hidden text-muted-foreground sm:hidden"
        style={{ height: ptrRefreshing ? 40 : ptrPull }}
        aria-hidden={!ptrRefreshing && ptrPull === 0}
      >
        <RefreshCw className={cn("size-5", (ptrRefreshing || ptrPull >= ptrThreshold) && "animate-spin")} />
      </div>

      {shop && (shop.name || shop.logoDataUrl) && (
        <div className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-xl border bg-card p-4">
          {headerBg.enabled && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 dark:hidden"
                style={{ backgroundImage: `url(${resolveCardHeaderBgUrl(headerBg)})`, backgroundRepeat: "repeat", backgroundSize: "170px 170px", opacity: cardHeaderBgOpacity(headerBg) }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 hidden invert dark:block"
                style={{ backgroundImage: `url(${resolveCardHeaderBgUrl(headerBg)})`, backgroundRepeat: "repeat", backgroundSize: "170px 170px", opacity: cardHeaderBgDarkOpacity(headerBg) }}
              />
            </>
          )}
          <div className="flex items-center gap-3">
            {shop.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logoDataUrl} alt={shop.name || "Company logo"} className="size-12 shrink-0 rounded-lg border bg-white object-contain" />
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Scissors className="size-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold tracking-tight">Hello, {shop.name || "there"}</p>
              <p className="text-sm text-muted-foreground">Good Day! Welcome On Board</p>
            </div>
          </div>
          <DigitalClock />
        </div>
      )}

      {user?.role === "admin" && <LiveUsersCard />}

      {/* Mirrors the Zoho Books "Dashboard / Getting Started" tab layout — replaces the earlier
          inline checklist card with a full onboarding page one click away, instead of competing
          for space on the dashboard itself. */}
      <Tabs value={tab} onValueChange={(v) => v && setTab(v as DashboardTab)}>
        {/* Hidden on mobile — the fixed bottom bar below (MOBILE_TABS) replaces it there,
         *  thumb-reachable instead of needing a reach-up-and-tap at the top of the screen. */}
        <TabsList className="hidden sm:inline-flex">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="getting-started">Getting Started</TabsTrigger>
          <TabsTrigger value="recent-updates">Recent Updates</TabsTrigger>
          <TabsTrigger value="get-support">Get Support</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <PageHeader
            title="Dashboard"
            description="Today's snapshot of your company"
            // Sticky on desktop only (sm+) — mirrors the Topbar's own sticky/backdrop-blur treatment
            // and sits just below it (top-14 = Topbar's min-h-14) so the quick-action buttons stay
            // reachable while scrolling the widget grid, instead of scrolling away with the title.
            // Mobile keeps the normal in-flow header — its actions are hidden here anyway (shown via
            // the bottom tab bar instead), so there's nothing worth pinning.
            className="sm:sticky sm:top-14 sm:z-20 sm:-mx-6 sm:border-b sm:bg-background/95 sm:px-6 sm:py-3 sm:backdrop-blur"
            actions={
              <>
                {user?.perms.addOrder && (
                  <Button nativeButton={false} render={<Link href="/orders/new" />} className="hidden sm:inline-flex">
                    <ClipboardList className="size-4" /> New Order
                  </Button>
                )}
                {user?.perms.manageSales && (
                  <Button nativeButton={false} render={<Link href="/sales/invoices/new" />} className="hidden sm:inline-flex">
                    <Receipt className="size-4" /> New Invoice
                  </Button>
                )}
                <Button nativeButton={false} render={<Link href="/expenses/new" />} className="hidden sm:inline-flex">
                  <Wallet className="size-4" /> New Expense
                </Button>
                {user?.perms.managePayments && <NewPaymentButton className="hidden sm:inline-flex" />}
                {(user?.perms.manageCustomers || user?.role === "admin" || user?.role === "manager") && (
                  <Button nativeButton={false} render={<Link href="/crm/new" />} className="hidden sm:inline-flex">
                    <UserPlus className="size-4" /> New Customer
                  </Button>
                )}
                <Button variant={panelOpen ? "default" : "outline"} onClick={() => setPanelOpen(true)}>
                  {panelOpen ? <Check className="size-4" /> : <Settings2 className="size-4" />}
                  Customize
                </Button>
              </>
            }
          />

          {!initialized && (layoutLoading || entitlementsLoading) ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <DashboardGrid widgets={roleVisibleWidgets} editing={panelOpen} onChange={handleChange} />
          )}
        </TabsContent>

        <TabsContent value="getting-started">
          <GettingStartedTab />
        </TabsContent>

        <TabsContent value="recent-updates">
          <RecentUpdatesTab />
        </TabsContent>

        <TabsContent value="get-support">
          <GetSupportTab />
        </TabsContent>
      </Tabs>

      <CustomizePanel open={panelOpen} onOpenChange={setPanelOpen} widgets={roleVisibleWidgets} onChange={handleChange} />

      {/* Mobile-only bottom bar for this page's OWN 4 tabs — not the app's primary navigation
       *  (see MobileTabBar in src/components/app-shell/mobile-nav.tsx, which already owns
       *  bottom-0 app-wide). Stacked directly above that bar (`bottom-[3rem+safe-area]`,
       *  matching its own `min-h-12` + safe-area-inset-bottom sizing) rather than overlapping
       *  it — two independent fixed bottom bars, not one replacing the other. The app shell's
       *  `pb-24` on `<main>` already reserves room for the global bar; this page adds its own
       *  extra `pb-16` above (see the root div's className) so content clears both. */}
      <nav
        aria-label="Dashboard sections"
        className="fixed inset-x-0 z-30 flex items-stretch border-t bg-card/95 backdrop-blur-sm sm:hidden print:hidden"
        style={{ bottom: "calc(3rem + env(safe-area-inset-bottom))" }}
      >
        {MOBILE_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center truncate px-1 text-[11px] font-medium transition-colors",
              tab === t.value ? "text-primary" : "text-muted-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
