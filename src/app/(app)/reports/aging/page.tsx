"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { buildWhatsAppUrl } from "@/lib/business-rules";
import { getAgingList } from "@/lib/analytics";
import { DEFAULT_STITCHING_WHATSAPP_TEMPLATES } from "@/lib/stitching-whatsapp";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTableSort } from "@/hooks/use-table-sort";
import type { Order } from "@/lib/types";

const BAND_STYLE: Record<string, string> = {
  Fresh: "bg-muted text-muted-foreground",
  "1-30 days": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "30+ days": "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

type AgingRow = Order & { agingBand: string; daysOver: number };

const SORT_COMPARATORS: Record<string, (a: AgingRow, b: AgingRow) => number> = {
  order: (a, b) => a.id.localeCompare(b.id),
  customer: (a, b) => a.name.localeCompare(b.name),
  aging: (a, b) => a.daysOver - b.daysOver,
  balance: (a, b) => a.balance - b.balance,
};
const SORT_DESC_KEYS = new Set(["aging", "balance"]);

export default function BalanceAgingPage() {
  const router = useRouter();
  const { orders, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { data: waTemplates } = useAppSetting("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [band, setBand] = useState("all");

  const agingAll = useMemo(() => getAgingList(orders.filter((o) => isWithinDateRange(o.inDate, range))), [orders, range]);
  const aging = useMemo(() => agingAll.filter((o) => band === "all" || o.agingBand === band), [agingAll, band]);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<AgingRow>("aging", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedAging = applySort(aging);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totalDue = aging.reduce((s, o) => s + o.balance, 0);

  return (
    <ReportShell
      title="Balance Aging"
      description={aging.length > 0 ? `${inr(totalDue)} outstanding across ${aging.length} orders` : undefined}
      actions={
        <ReportActionsMenu
          rows={sortedAging.map((o) => ({ Order: o.id, Name: o.name, Mobile: o.mobile, Balance: o.balance, Band: o.agingBand, DaysOverdue: o.daysOver }))}
          filename="balance-aging"
          title="Balance Aging"
          summaryLines={[`Orders: ${aging.length}`, `Total outstanding: ${inr(totalDue)}`]}
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
          <Select value={band} onValueChange={(v) => v && setBand(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{band === "all" ? "All Aging" : band}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Aging</SelectItem>
              {Array.from(new Set(agingAll.map((o) => o.agingBand))).map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {aging.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No outstanding balances" description="Every order is fully paid." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="order" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Order</Th>
                  <Th sortKey="customer" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Customer</Th>
                  <Th sortKey="aging" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Aging</Th>
                  <Th align="right" sortKey="balance" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Balance</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td colSpan={3}>Total</Td>
                  <Td align="right">{inr(totalDue)}</Td>
                  <Td align="right">—</Td>
                </ReportTotalsRow>
                {sortedAging.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30">
                    <Td>
                      <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                        {o.id}
                      </Link>
                    </Td>
                    <Td>
                      <p className="truncate">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.mobile}</p>
                    </Td>
                    <Td>
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${BAND_STYLE[o.agingBand]}`}>
                        {o.agingBand}
                        {o.daysOver > 0 ? ` · ${o.daysOver}d` : ""}
                      </span>
                    </Td>
                    <Td align="right">
                      <BalanceDue amount={o.balance} />
                    </Td>
                    <Td align="right">
                      <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop, waTemplates)} label={`Payment reminder to ${o.name}`} tone="reminder" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(totalDue)} showChevron={false} />
            </MobileRecordCard>
            {sortedAging.map((o) => (
              // onClick (not href) — the WhatsApp button below renders its own <a>, which can't
              // nest inside this card's anchor.
              <MobileRecordCard key={o.id} onClick={() => router.push(`/orders/${o.id}`)}>
                <MobileRecordHeader title={o.name} subtitle={o.mobile} value={<BalanceDue amount={o.balance} />} />
                <MobileRecordRow label="Order" value={o.id} />
                <MobileRecordRow
                  label="Aging"
                  value={
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${BAND_STYLE[o.agingBand]}`}>
                      {o.agingBand}
                      {o.daysOver > 0 ? ` · ${o.daysOver}d` : ""}
                    </span>
                  }
                />
                <div className="flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
                  <span className="text-muted-foreground">Actions</span>
                  <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop, waTemplates)} label={`Payment reminder to ${o.name}`} tone="reminder" />
                </div>
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
