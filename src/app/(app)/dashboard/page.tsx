"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Scissors, UserPlus, TrendingUp, CreditCard, Users, ClipboardList, BarChart2, Receipt, Settings2, Check } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
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
  const { widgets: savedWidgets, isLoading: layoutLoading, save } = useDashboardLayout();

  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!layoutLoading && !initializedRef.current) {
      setWidgets(savedWidgets);
      initializedRef.current = true;
    }
  }, [layoutLoading, savedWidgets]);

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
                <Plus className="size-4" /> New order
              </Button>
            )}
            <Button variant={panelOpen ? "default" : "outline"} onClick={() => setPanelOpen(true)}>
              {panelOpen ? <Check className="size-4" /> : <Settings2 className="size-4" />}
              Customize
            </Button>
          </>
        }
      />

      {/* Quick actions — fixed navigation chrome, not a customizable widget */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {user?.perms.addOrder && <QuickAction href="/orders/new" icon={Plus} label="New order" />}
        {!user?.restricted && user?.perms.manageCustomers && <QuickAction href="/crm/new" icon={UserPlus} label="New customer" />}
        <QuickAction href="/orders" icon={ClipboardList} label="All orders" />
        <QuickAction href="/orders?view=board" icon={Scissors} label="Work board" />
        {!user?.restricted && <QuickAction href="/crm" icon={Users} label="Customers" />}
        {!user?.restricted && <QuickAction href="/reports/monthly" icon={BarChart2} label="Reports" />}
        {!user?.restricted && <QuickAction href="/expenses" icon={Receipt} label="Expenses" />}
        {!user?.restricted && <QuickAction href="/activity-log" icon={TrendingUp} label="Activity" />}
        {user?.perms.manageSales && <QuickAction href="/sales/invoices/new" icon={Receipt} label="New invoice" />}
        {user?.perms.manageManufacturing && <QuickAction href="/manufacturing/new" icon={CreditCard} label="New work order" />}
      </div>

      {!initializedRef.current && layoutLoading ? (
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

function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof Plus; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card p-3 text-center text-xs font-medium transition-colors hover:bg-muted/50 active:scale-[0.98]"
    >
      <Icon className="size-5 text-muted-foreground" />
      {label}
    </Link>
  );
}
