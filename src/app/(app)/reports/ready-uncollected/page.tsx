"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { buildWhatsAppUrl } from "@/lib/business-rules";
import { getReadyUncollected, type ReadyUncollectedRow } from "@/lib/analytics";
import { DEFAULT_STITCHING_WHATSAPP_TEMPLATES } from "@/lib/stitching-whatsapp";
import { fmtDate, inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTableSort } from "@/hooks/use-table-sort";

const SORT_COMPARATORS: Record<string, (a: ReadyUncollectedRow, b: ReadyUncollectedRow) => number> = {
  order: (a, b) => a.id.localeCompare(b.id),
  customer: (a, b) => a.name.localeCompare(b.name),
  mobile: (a, b) => a.mobile.localeCompare(b.mobile),
  daysWaiting: (a, b) => a.daysWaiting - b.daysWaiting,
  balance: (a, b) => a.balance - b.balance,
};
const SORT_DESC_KEYS = new Set(["daysWaiting", "balance"]);

/** Orders sitting in "ready" the longest without being picked up — distinct from Balance Aging,
 *  which tracks the delivery-date promise, not physical pickup. Excludes orders that reached
 *  "ready" before the ready_at column existed (see src/lib/analytics.ts getReadyUncollected). */
export default function ReadyUncollectedPage() {
  const { orders, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { data: waTemplates } = useAppSetting("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [garmentType, setGarmentType] = useState("all");

  const allReadyUncollected = useMemo(() => getReadyUncollected(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);
  const garmentTypes = useMemo(() => {
    const set = new Set(allReadyUncollected.flatMap((o) => o.garments.map((g) => g.type)).filter(Boolean));
    return Array.from(set).sort();
  }, [allReadyUncollected]);
  const readyUncollected = useMemo(
    () => allReadyUncollected.filter((o) => garmentType === "all" || o.garments.some((g) => g.type === garmentType)),
    [allReadyUncollected, garmentType]
  );

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<ReadyUncollectedRow>("ready-uncollected", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(readyUncollected);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalBalance = readyUncollected.reduce((s, o) => s + o.balance, 0);

  return (
    <ReportShell
      title="Ready & Uncollected"
      description={`${readyUncollected.length} order(s) ready for pickup, longest-waiting first`}
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((o) => ({ Order: o.id, Customer: o.name, Mobile: o.mobile, "Days Waiting": o.daysWaiting, Balance: o.balance }))}
          filename="ready-uncollected"
          title="Ready & Uncollected"
          summaryLines={[`Orders: ${readyUncollected.length}`, `Total balance: ${inr(totalBalance)}`]}
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

      {readyUncollected.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nothing waiting" description="Every ready order has been picked up." />
      ) : (
        <>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(totalBalance)} showChevron={false} />
            </MobileRecordCard>
            {sortedRows.map((o) => (
              <MobileRecordCard key={o.id}>
                <MobileRecordHeader
                  title={
                    <Link href={`/orders/${o.id}`} className="hover:underline">
                      {o.id}
                    </Link>
                  }
                  subtitle={o.name}
                  value={o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}
                  showChevron={false}
                />
                <MobileRecordRow label="Mobile" value={o.mobile} />
                <MobileRecordRow label="Ready since" value={fmtDate(o.readyAt!.slice(0, 10))} />
                <MobileRecordRow label="Days waiting" value={`${o.daysWaiting}d`} valueClassName={o.daysWaiting >= 7 ? "font-medium text-destructive" : undefined} />
                <div className="flex justify-end border-t pt-1.5">
                  <WhatsAppIconButton href={buildWhatsAppUrl(o, o.balance > 0 ? "paymentDue" : "ready", shop, waTemplates)} label={`Pickup reminder to ${o.name}`} tone={o.balance > 0 ? "reminder" : "whatsapp"} />
                </div>
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="order" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Order</Th>
                  <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
                  <Th sortKey="mobile" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Mobile</Th>
                  <Th align="right" sortKey="daysWaiting" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Days waiting</Th>
                  <Th align="right" sortKey="balance" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Balance</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={4}>Total</Td>
                  <Td align="right">{inr(totalBalance)}</Td>
                  <Td align="right">—</Td>
                </ReportTotalsRow>
                {sortedRows.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30">
                    <Td>
                      <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                        {o.id}
                      </Link>
                      <p className="text-xs text-muted-foreground">Ready since {fmtDate(o.readyAt!.slice(0, 10))}</p>
                    </Td>
                    <Td>
                      <p className="truncate">{o.name}</p>
                    </Td>
                    <Td className="text-muted-foreground">{o.mobile}</Td>
                    <Td align="right" className={o.daysWaiting >= 7 ? "font-medium text-destructive" : undefined}>
                      {o.daysWaiting}d
                    </Td>
                    <Td align="right">{o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}</Td>
                    <Td align="right">
                      <WhatsAppIconButton href={buildWhatsAppUrl(o, o.balance > 0 ? "paymentDue" : "ready", shop, waTemplates)} label={`Pickup reminder to ${o.name}`} tone={o.balance > 0 ? "reminder" : "whatsapp"} />
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
