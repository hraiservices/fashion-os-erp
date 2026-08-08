"use client";

import { Gift, Coins, TicketPercent, Users } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loyalty Impact — an original construction for this rewrite (see getLoyaltyImpact() in
 * lib/analytics.ts): the old app's sidebar had this label but no matching computation,
 * so this is built from data already on hand rather than fabricated.
 */
export default function LoyaltyImpactPage() {
  const { loyaltyImpact, loyaltyCfg, isLoading } = useReportsData();

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
    <ReportShell title="Loyalty Impact" description="What your points programme is costing and earning">
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
