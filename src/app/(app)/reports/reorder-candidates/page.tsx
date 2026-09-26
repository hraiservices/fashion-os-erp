"use client";

import { useMemo, useState } from "react";
import { UserX } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { buildReorderReminderUrl } from "@/lib/business-rules";
import { getReorderCandidates, type ReorderCandidateRow } from "@/lib/analytics";
import { fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTableSort } from "@/hooks/use-table-sort";

const MONTHS_THRESHOLD = 6;

const SORT_COMPARATORS: Record<string, (a: ReorderCandidateRow, b: ReorderCandidateRow) => number> = {
  customer: (a, b) => a.name.localeCompare(b.name),
  mobile: (a, b) => a.mobile.localeCompare(b.mobile),
  lastOrder: (a, b) => a.lastOrderDate.localeCompare(b.lastOrderDate),
  monthsSince: (a, b) => a.monthsSince - b.monthsSince,
  totalOrders: (a, b) => a.orders.length - b.orders.length,
};
const SORT_DESC_KEYS = new Set(["monthsSince", "totalOrders"]);

/** Customers whose last stitching order is 6+ months old — a staff-review nudge list, no
 *  auto-send (see src/lib/analytics.ts getReorderCandidates). Stays populated until the
 *  customer actually places a new order, same convention as Ready & Uncollected. The date
 *  range filters which orders count toward "last order" — narrowing it will surface customers
 *  as overdue whose most recent order simply falls outside the selected window. */
export default function ReorderCandidatesPage() {
  const { orders, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [garmentType, setGarmentType] = useState("all");

  const allReorderCandidates = useMemo(() => getReorderCandidates(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);
  const garmentTypes = useMemo(() => {
    const set = new Set(allReorderCandidates.flatMap((c) => c.orders.flatMap((o) => o.garments.map((g) => g.type))).filter(Boolean));
    return Array.from(set).sort();
  }, [allReorderCandidates]);
  const reorderCandidates = useMemo(
    () => allReorderCandidates.filter((c) => garmentType === "all" || c.orders.some((o) => o.garments.some((g) => g.type === garmentType))),
    [allReorderCandidates, garmentType]
  );

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<ReorderCandidateRow>("reorder-candidates", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(reorderCandidates);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Reorder Candidates"
      description={`${reorderCandidates.length} customer(s) with no order in ${MONTHS_THRESHOLD}+ months`}
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((c) => ({ Customer: c.name, Mobile: c.mobile, "Last Order": fmtDate(c.lastOrderDate), "Months Since": c.monthsSince, "Total Orders": c.orders.length }))}
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
        category={
          <Select value={garmentType} onValueChange={(v) => v && setGarmentType(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{garmentType === "all" ? "All Garments" : garmentType}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Garments</SelectItem>
              {garmentTypes.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
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
            {sortedRows.map((c) => (
              <MobileRecordCard key={c.mobile}>
                <MobileRecordHeader title={c.name} value={`${c.monthsSince}mo`} valueClassName={c.monthsSince >= 12 ? "font-medium text-destructive" : undefined} showChevron={false} />
                <MobileRecordRow label="Mobile" value={c.mobile} />
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
                  <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
                  <Th sortKey="mobile" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Mobile</Th>
                  <Th sortKey="lastOrder" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Last order</Th>
                  <Th align="right" sortKey="monthsSince" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Months since</Th>
                  <Th align="right" sortKey="totalOrders" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Total orders</Th>
                  <Th align="right">Send reminder</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={4}>{reorderCandidates.length} customer{reorderCandidates.length === 1 ? "" : "s"}</Td>
                  <Td align="right">{reorderCandidates.reduce((s, c) => s + c.orders.length, 0)}</Td>
                  <Td align="right">—</Td>
                </ReportTotalsRow>
                {sortedRows.map((c) => (
                  <tr key={c.mobile} className="hover:bg-muted/30">
                    <Td>
                      <p className="truncate font-medium">{c.name}</p>
                    </Td>
                    <Td className="text-muted-foreground">{c.mobile}</Td>
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
