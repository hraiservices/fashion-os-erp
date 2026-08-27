"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Scissors, UserPlus, ClipboardList, Receipt, Settings2, Check, Wallet } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isWidgetEnabled } from "@/lib/entitlements";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import { CustomizePanel } from "@/components/dashboard/customize-panel";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { DigitalClock } from "@/components/dashboard/digital-clock";
import type { WidgetInstance } from "@/lib/dashboard-widgets";

export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
  const { widgets: savedWidgets, rawData: layoutRawData, isLoading: layoutLoading, save } = useDashboardLayout();
  const { data: entitlements, isLoading: entitlementsLoading } = useModuleEntitlements();

  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Guard on layoutRawData (the actual fetched array, not the defaultLayout() fallback) so the
    // ref is only locked once real data arrives. Without this, entitlements arriving from cache
    // before the user/email resolves would fire the effect against the defaultLayout() fallback,
    // permanently locking out the real fetched layout on client-side navigation.
    if (layoutRawData !== undefined && entitlements && !initializedRef.current) {
      setWidgets(savedWidgets.filter((w) => w.kind === "custom" || isWidgetEnabled(entitlements, w.builtinKey!)));
      initializedRef.current = true;
    }
  }, [layoutRawData, entitlements]);

  function handleChange(next: WidgetInstance[]) {
    setWidgets(next);
    save.mutate(next, { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save layout") });
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {shop && (shop.name || shop.logoDataUrl) && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            {shop.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logoDataUrl} alt={shop.name || "Shop logo"} className="size-12 shrink-0 rounded-lg border bg-white object-contain" />
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

      <OnboardingChecklist />

      <PageHeader
        title="Dashboard"
        description="Today's snapshot of your shop"
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

      {!initializedRef.current && (layoutLoading || entitlementsLoading) ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <DashboardGrid widgets={widgets} editing={panelOpen} onChange={handleChange} />
      )}

      <CustomizePanel open={panelOpen} onOpenChange={setPanelOpen} widgets={widgets} onChange={handleChange} />
    </div>
  );
}
