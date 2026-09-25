"use client";

import { useMemo, useState } from "react";
import { Ticket } from "lucide-react";
import { useReferralCoupons } from "@/hooks/use-referral-coupons";
import { getTopReferrers } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

const REDEMPTION_OPTIONS = [
  { value: "all", label: "All" },
  { value: "redeemed", label: "Redeemed" },
  { value: "unredeemed", label: "Unredeemed" },
] as const;

/** Which customers' referral coupons actually convert — see src/lib/analytics.ts getTopReferrers. */
export default function TopReferrersPage() {
  const { data: coupons, isLoading } = useReferralCoupons();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [redemption, setRedemption] = useState<(typeof REDEMPTION_OPTIONS)[number]["value"]>("all");

  const topReferrers = useMemo(
    () =>
      getTopReferrers(
        (coupons || [])
          .filter((c) => isWithinDateRange(c.issuedAt, range))
          .filter((c) => redemption === "all" || (redemption === "redeemed" ? !!c.redeemedAt : !c.redeemedAt))
      ),
    [coupons, range, redemption]
  );

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalIssued = topReferrers.reduce((s, r) => s + r.issued, 0);
  const totalRedeemed = topReferrers.reduce((s, r) => s + r.redeemed, 0);

  return (
    <ReportShell
      title="Top Referrers"
      description="Coupons issued vs. redeemed, by who referred them"
      actions={
        <ReportActionsMenu
          rows={topReferrers.map((r) => ({ Referrer: r.referrerName || r.referrerMobile, Issued: r.issued, Redeemed: r.redeemed, "Redemption rate": `${r.redemptionRate}%` }))}
          filename="top-referrers"
          title="Top Referrers"
          summaryLines={[`Referrers: ${topReferrers.length}`, `Total issued: ${totalIssued}`, `Total redeemed: ${totalRedeemed}`]}
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
        category={
          <div className="inline-flex flex-wrap gap-1" role="group" aria-label="Filter by redemption status">
            {REDEMPTION_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setRedemption(o.value)}
                aria-pressed={redemption === o.value}
                className={cn(
                  "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
                  redemption === o.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        }
      />

      {topReferrers.length === 0 ? (
        <EmptyState icon={Ticket} title="No coupons issued yet" description="Give a referral coupon from a customer's CRM page to start tracking this." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Referrer</Th>
                  <Th align="right">Issued</Th>
                  <Th align="right">Redeemed</Th>
                  <Th align="right">Redemption rate</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{totalIssued}</Td>
                  <Td align="right">{totalRedeemed}</Td>
                  <Td align="right">{totalIssued > 0 ? Math.round((totalRedeemed / totalIssued) * 100) : 0}%</Td>
                </ReportTotalsRow>
                {topReferrers.map((r) => (
                  <tr key={r.referrerMobile} className="hover:bg-muted/30">
                    <Td>
                      <p className="truncate font-medium">{r.referrerName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.referrerMobile}</p>
                    </Td>
                    <Td align="right">{r.issued}</Td>
                    <Td align="right">{r.redeemed}</Td>
                    <Td align="right">{r.redemptionRate}%</Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={`${totalIssued > 0 ? Math.round((totalRedeemed / totalIssued) * 100) : 0}%`} showChevron={false} />
              <MobileRecordRow label="Issued" value={totalIssued} />
              <MobileRecordRow label="Redeemed" value={totalRedeemed} />
            </MobileRecordCard>
            {topReferrers.map((r) => (
              <MobileRecordCard key={r.referrerMobile}>
                <MobileRecordHeader title={r.referrerName || "—"} subtitle={r.referrerMobile} value={`${r.redemptionRate}%`} showChevron={false} />
                <MobileRecordRow label="Issued" value={r.issued} />
                <MobileRecordRow label="Redeemed" value={r.redeemed} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
