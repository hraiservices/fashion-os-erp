"use client";

import { useMemo } from "react";
import { UserX } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { buildReorderReminderUrl } from "@/lib/business-rules";
import { getReorderCandidates } from "@/lib/analytics";
import { fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

const MONTHS_THRESHOLD = 6;

/** Customers whose last stitching order is 6+ months old — a staff-review nudge list, no
 *  auto-send (see src/lib/analytics.ts getReorderCandidates). Stays populated until the
 *  customer actually places a new order, same convention as Ready & Uncollected. The date
 *  range filters which orders count toward "last order" — narrowing it will surface customers
 *  as overdue whose most recent order simply falls outside the selected window. */
export default function ReorderCandidatesPage() {
  const { orders, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const reorderCandidates = useMemo(() => getReorderCandidates(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Reorder Candidates"
      description={`${reorderCandidates.length} customer(s) with no order in ${MONTHS_THRESHOLD}+ months`}
      actions={
        <ReportActionsMenu
          rows={reorderCandidates.map((c) => ({ Customer: c.name, Mobile: c.mobile, "Last Order": fmtDate(c.lastOrderDate), "Months Since": c.monthsSince, "Total Orders": c.orders.length }))}
          filename="reorder-candidates"
          title="Reorder Candidates"
          summaryLines={[`Customers: ${reorderCandidates.length}`]}
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
      />

      {reorderCandidates.length === 0 ? (
        <EmptyState icon={UserX} title="Nobody due yet" description="Every customer has ordered within the last 6 months." />
      ) : (
        <>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader
                title={`${reorderCandidates.length} customer${reorderCandidates.length === 1 ? "" : "s"}`}
                value={reorderCandidates.reduce((s, c) => s + c.orders.length, 0)}
                showChevron={false}
              />
            </MobileRecordCard>
            {reorderCandidates.map((c) => (
              <MobileRecordCard key={c.mobile}>
                <MobileRecordHeader title={c.name} subtitle={c.mobile} value={`${c.monthsSince}mo`} valueClassName={c.monthsSince >= 12 ? "font-medium text-destructive" : undefined} showChevron={false} />
                <MobileRecordRow label="Last order" value={fmtDate(c.lastOrderDate)} />
                <MobileRecordRow label="Total orders" value={c.orders.length} />
                <div className="flex justify-end border-t pt-1.5">
                  <WhatsAppIconButton href={buildReorderReminderUrl(c.mobile, c.name, c.lastOrderDate, shop)} label={`Reorder reminder to ${c.name}`} />
                </div>
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Customer</Th>
                  <Th>Last order</Th>
                  <Th align="right">Months since</Th>
                  <Th align="right">Total orders</Th>
                  <Th align="right">Send reminder</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={3}>{reorderCandidates.length} customer{reorderCandidates.length === 1 ? "" : "s"}</Td>
                  <Td align="right">{reorderCandidates.reduce((s, c) => s + c.orders.length, 0)}</Td>
                  <Td align="right">—</Td>
                </ReportTotalsRow>
                {reorderCandidates.map((c) => (
                  <tr key={c.mobile} className="hover:bg-muted/30">
                    <Td>
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.mobile}</p>
                    </Td>
                    <Td>{fmtDate(c.lastOrderDate)}</Td>
                    <Td align="right" className={c.monthsSince >= 12 ? "font-medium text-destructive" : undefined}>
                      {c.monthsSince}mo
                    </Td>
                    <Td align="right">{c.orders.length}</Td>
                    <Td align="right">
                      <WhatsAppIconButton href={buildReorderReminderUrl(c.mobile, c.name, c.lastOrderDate, shop)} label={`Reorder reminder to ${c.name}`} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
        </>
      )}
    </ReportShell>
  );
}
