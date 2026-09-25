"use client";

import { useMemo, useState } from "react";
import { Gift, Coins, TicketPercent, Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { getLoyaltyImpact } from "@/lib/analytics";
import { loyaltyTier } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useCustomers } from "@/hooks/use-customers";
import { cn } from "@/lib/utils";

const TIER_OPTIONS = ["all", "Bronze", "Silver", "Gold", "Platinum"] as const;
type TierFilter = (typeof TIER_OPTIONS)[number];

/** Shared All/Bronze/Silver/Gold/Platinum segmented control for the tier filter below. */
function LoyaltyTierFilter({ value, onChange }: { value: TierFilter; onChange: (v: TierFilter) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1" role="group" aria-label="Filter by loyalty tier">
      {TIER_OPTIONS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          aria-pressed={value === t}
          className={cn(
            "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
            value === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {t === "all" ? "All Tiers" : t}
        </button>
      ))}
    </div>
  );
}

/**
 * Loyalty Impact — an original construction for this rewrite (see getLoyaltyImpact() in
 * lib/analytics.ts): the old app's sidebar had this label but no matching computation,
 * so this is built from data already on hand rather than fabricated. Point-in-time snapshot
 * ("lifetime earned" is cumulative-to-date) — the date range filters the underlying orders
 * (by inDate) feeding it, per the earlier decision to apply the range everywhere.
 */
export default function LoyaltyImpactPage() {
  const { orders, loyaltyCfg, isLoading } = useReportsData();
  const { data: customers } = useCustomers();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [tier, setTier] = useState<TierFilter>("all");

  const tierFilteredCustomers = useMemo(
    () => (customers || []).filter((c) => tier === "all" || loyaltyTier(c.totalEarned, loyaltyCfg).label === tier),
    [customers, loyaltyCfg, tier]
  );

  const loyaltyImpact = useMemo(
    () => getLoyaltyImpact(orders.filter((o) => isWithinDateRange(o.inDate, range)), tierFilteredCustomers, loyaltyCfg),
    [orders, tierFilteredCustomers, loyaltyCfg, range]
  );

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  if (!loyaltyCfg?.enabled) {
    return (
      <ReportShell title="Loyalty Impact">
        <EmptyState icon={Gift} title="Loyalty program is off" description="Enable it in Settings → Loyalty to start tracking points and redemptions." />
      </ReportShell>
    );
  }

  const totalTiers = Object.values(loyaltyImpact.tierCounts).reduce((s, n) => s + n, 0) || 1;

  return (
    <ReportShell
      title="Loyalty Impact"
      description="What your points programme is costing and earning"
      actions={
        <ReportActionsMenu
          rows={Object.entries(loyaltyImpact.tierCounts).map(([tier, count]) => ({ Tier: tier, Customers: count }))}
          filename="loyalty-impact"
          title="Loyalty Impact"
          summaryLines={[
            `Points outstanding: ${loyaltyImpact.totalPointsOutstanding}`,
            `Lifetime earned: ${loyaltyImpact.totalPointsEverEarned}`,
            `Discount given: ${inr(loyaltyImpact.totalDiscountGiven)}`,
            `Redeeming customers: ${loyaltyImpact.redeemingCustomers}/${loyaltyImpact.totalCustomers}`,
          ]}
        />
      }
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        category={<LoyaltyTierFilter value={tier} onChange={setTier} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Points outstanding" value={loyaltyImpact.totalPointsOutstanding.toLocaleString("en-IN")} hint="unredeemed liability" icon={Coins} />
        <StatCard label="Lifetime earned" value={loyaltyImpact.totalPointsEverEarned.toLocaleString("en-IN")} hint="all points ever given" icon={Gift} />
        <StatCard label="Discount given" value={inr(loyaltyImpact.totalDiscountGiven)} hint="redeemed as ₹ off" icon={TicketPercent} tone="warning" />
        <StatCard
          label="Have redeemed"
          value={`${loyaltyImpact.redeemingCustomers}/${loyaltyImpact.totalCustomers}`}
          hint="customers using points"
          icon={Users}
        />
      </div>

      <ReportCard className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Tier distribution</h2>
        <div className="space-y-2.5">
          {Object.entries(loyaltyImpact.tierCounts).map(([tier, count]) => (
            <div key={tier} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 text-[13px]">{tier}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(count / totalTiers) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      </ReportCard>
    </ReportShell>
  );
}
