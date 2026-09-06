"use client";

import { useMemo } from "react";
import { UserX } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { buildReorderReminderUrl } from "@/lib/business-rules";
import { getReorderCandidates } from "@/lib/analytics";
import { fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

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
    <ReportShell title="Reorder Candidates" description={`${reorderCandidates.length} customer(s) with no order in ${MONTHS_THRESHOLD}+ months`}>
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
      )}
    </ReportShell>
  );
}
