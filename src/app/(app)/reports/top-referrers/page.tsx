"use client";

import { Ticket } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/** Which customers' referral coupons actually convert — see src/lib/analytics.ts getTopReferrers. */
export default function TopReferrersPage() {
  const { topReferrers, isLoading } = useReportsData();

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell title="Top Referrers" description="Coupons issued vs. redeemed, by who referred them">
      {topReferrers.length === 0 ? (
        <EmptyState icon={Ticket} title="No coupons issued yet" description="Give a referral coupon from a customer's CRM page to start tracking this." />
      ) : (
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
      )}
    </ReportShell>
  );
}
