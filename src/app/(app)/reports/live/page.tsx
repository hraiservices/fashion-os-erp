"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Radio, PackageCheck, Wallet } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { buildWhatsAppUrl } from "@/lib/business-rules";
import { getReadyUncollected, getDeliveredUnpaid } from "@/lib/analytics";
import { DEFAULT_STITCHING_WHATSAPP_TEMPLATES } from "@/lib/stitching-whatsapp";
import { fmtDate, inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { ColumnCustomizerMenu } from "@/components/ui/column-customizer";
import { useColumnVisibility } from "@/hooks/use-column-visibility";
import { StageBadge } from "@/components/orders/stage-badge";
import type { Stage } from "@/lib/business-rules";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

/** "1 day" vs "5 days" — plain count, no abbreviation. */
function daysLabel(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

// Stage is `required` — shown per order in both sections regardless of the (otherwise obvious)
// section it's under, per explicit request. Waiting/Delivery only render in their own section
// (Ready has no delivery date column, Picked-up-not-paid has no days-waiting column) but share
// one visibility toggle set so there's a single Columns menu for the whole page.
const LIVE_REPORT_COLUMNS = [
  { key: "order", label: "Order", required: true },
  { key: "customer", label: "Customer", required: true },
  { key: "stage", label: "Stage", required: true },
  { key: "waiting", label: "Days Waiting" },
  { key: "delivery", label: "Delivery Date" },
  { key: "balance", label: "Balance", required: true },
  { key: "actions", label: "Actions", required: true },
];

/** The two situations that most need a nudge, side by side on one screen instead of buried in
 *  separate reports: an order sitting "ready" that the customer hasn't come to collect, and an
 *  order already collected ("delivered") that's still owing money — see getDeliveredUnpaid's
 *  own comment for why "delivered" alone already implies unpaid. Same WhatsApp reminder wiring
 *  as Ready & Uncollected / Pending Orders, reused as-is rather than a new template. */
export default function LiveReportPage() {
  const { orders, isLoading } = useReportsData();
  const { data: shop } = useShopSettings();
  const { data: waTemplates } = useAppSetting("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const columnTable = useColumnVisibility("live-report", LIVE_REPORT_COLUMNS);
  const isVisible = columnTable.isVisible;

  const inRange = useMemo(() => orders.filter((o) => isWithinDateRange(o.inDate, range)), [orders, range]);
  const allReadyUncollected = useMemo(() => getReadyUncollected(inRange), [inRange]);
  const allDeliveredUnpaid = useMemo(() => getDeliveredUnpaid(inRange), [inRange]);
  const [stage, setStage] = useState<Stage | "all">("all");
  const stages = useMemo(
    () => Array.from(new Set([...allReadyUncollected.map((o) => o.status), ...allDeliveredUnpaid.map((o) => o.status)])),
    [allReadyUncollected, allDeliveredUnpaid]
  );
  const readyUncollected = useMemo(() => (stage === "all" ? allReadyUncollected : allReadyUncollected.filter((o) => o.status === stage)), [allReadyUncollected, stage]);
  const deliveredUnpaid = useMemo(() => (stage === "all" ? allDeliveredUnpaid : allDeliveredUnpaid.filter((o) => o.status === stage)), [allDeliveredUnpaid, stage]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const readyBalance = readyUncollected.reduce((s, o) => s + o.balance, 0);
  const unpaidBalance = deliveredUnpaid.reduce((s, o) => s + o.balance, 0);

  return (
    <ReportShell
      title="LIVE Report"
      description="Ready but not picked up, and picked up but not paid — one screen, one reminder tap"
      actions={
        <ReportActionsMenu
          rows={[
            ...readyUncollected.map((o) => ({ Section: "Ready, not picked up", Order: o.id, Customer: o.name, "Days Waiting": o.daysWaiting, Balance: o.balance })),
            ...deliveredUnpaid.map((o) => ({ Section: "Picked up, not paid", Order: o.id, Customer: o.name, "Days Waiting": "", Balance: o.balance })),
          ]}
          filename="live-report"
          title="LIVE Report"
          summaryLines={[
            `Ready, not picked up: ${readyUncollected.length} (${inr(readyBalance)})`,
            `Picked up, not paid: ${deliveredUnpaid.length} (${inr(unpaidBalance)})`,
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
        category={
          <Select value={stage} onValueChange={(v) => v && setStage(v as Stage | "all")}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{stage === "all" ? "All Stages" : <StageBadge stage={stage} size="sm" />}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s} value={s}>
                  <StageBadge stage={s} size="sm" />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <Radio className="size-3 animate-pulse" /> Live — reflects the current stage and balance of every order
        </div>
        <ColumnCustomizerMenu table={columnTable} />
      </div>

      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <PackageCheck className="size-4 text-emerald-600" />
            Ready, not picked up
            <span className="text-xs font-normal text-muted-foreground">
              {readyUncollected.length} order(s) · {inr(readyBalance)} pending balance
            </span>
          </h2>

          {readyUncollected.length === 0 ? (
            <EmptyState icon={PackageCheck} title="Nothing waiting" description="Every ready order has been picked up." />
          ) : (
            <>
              <MobileRecordList>
                {readyUncollected.map((o) => (
                  <MobileRecordCard key={o.id}>
                    <MobileRecordHeader
                      title={
                        <Link href={`/orders/${o.id}`} className="hover:underline">
                          {o.id}
                        </Link>
                      }
                      subtitle={`${o.name} · ${o.mobile}`}
                      value={o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}
                      showChevron={false}
                    />
                    <MobileRecordRow label="Stage" value={<StageBadge stage={o.status} size="sm" />} />
                    <MobileRecordRow label="Ready since" value={fmtDate(o.readyAt!.slice(0, 10))} />
                    {isVisible("waiting") && (
                      <MobileRecordRow label="Days waiting" value={daysLabel(o.daysWaiting)} valueClassName={o.daysWaiting >= 7 ? "font-medium text-destructive" : undefined} />
                    )}
                    <div className="flex justify-end border-t pt-1.5">
                      <WhatsAppIconButton
                        href={buildWhatsAppUrl(o, o.balance > 0 ? "paymentDue" : "ready", shop, waTemplates)}
                        label={`Pickup reminder to ${o.name}`}
                        tone={o.balance > 0 ? "reminder" : "whatsapp"}
                      />
                    </div>
                  </MobileRecordCard>
                ))}
              </MobileRecordList>

              <div className="hidden sm:block">
                <ReportTable>
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <Th>Order</Th>
                      <Th>Customer</Th>
                      <Th>Stage</Th>
                      {isVisible("waiting") && <Th align="right">Days waiting</Th>}
                      <Th align="right">Balance</Th>
                      <Th align="right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <ReportTotalsRow>
                      <Td colSpan={isVisible("waiting") ? 4 : 3}>Total</Td>
                      <Td align="right">{inr(readyBalance)}</Td>
                      <Td align="right">—</Td>
                    </ReportTotalsRow>
                    {readyUncollected.map((o) => (
                      <tr key={o.id} className="hover:bg-muted/30">
                        <Td>
                          <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                            {o.id}
                          </Link>
                          <p className="text-xs text-muted-foreground">Ready since {fmtDate(o.readyAt!.slice(0, 10))}</p>
                        </Td>
                        <Td>
                          <p className="truncate">{o.name}</p>
                          <p className="text-xs text-muted-foreground">{o.mobile}</p>
                        </Td>
                        <Td>
                          <StageBadge stage={o.status} size="sm" />
                        </Td>
                        {isVisible("waiting") && (
                          <Td align="right" className={o.daysWaiting >= 7 ? "font-medium text-destructive" : undefined}>
                            {daysLabel(o.daysWaiting)}
                          </Td>
                        )}
                        <Td align="right">{o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}</Td>
                        <Td align="right">
                          <WhatsAppIconButton
                            href={buildWhatsAppUrl(o, o.balance > 0 ? "paymentDue" : "ready", shop, waTemplates)}
                            label={`Pickup reminder to ${o.name}`}
                            tone={o.balance > 0 ? "reminder" : "whatsapp"}
                          />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </ReportTable>
              </div>
            </>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="size-4 text-amber-600" />
            Picked up, not paid
            <span className="text-xs font-normal text-muted-foreground">
              {deliveredUnpaid.length} order(s) · {inr(unpaidBalance)} pending balance
            </span>
          </h2>

          {deliveredUnpaid.length === 0 ? (
            <EmptyState icon={Wallet} title="Nothing unpaid" description="Every collected order has been fully paid." />
          ) : (
            <>
              <MobileRecordList>
                {deliveredUnpaid.map((o) => (
                  <MobileRecordCard key={o.id}>
                    <MobileRecordHeader
                      title={
                        <Link href={`/orders/${o.id}`} className="hover:underline">
                          {o.id}
                        </Link>
                      }
                      subtitle={`${o.name} · ${o.mobile}`}
                      value={<BalanceDue amount={o.balance} />}
                      showChevron={false}
                    />
                    <MobileRecordRow label="Stage" value={<StageBadge stage={o.status} size="sm" />} />
                    {isVisible("delivery") && <MobileRecordRow label="Delivery date" value={fmtDate(o.deliveryDate)} />}
                    <div className="flex justify-end border-t pt-1.5">
                      <WhatsAppIconButton href={buildWhatsAppUrl(o, "paymentDue", shop, waTemplates)} label={`Payment reminder to ${o.name}`} tone="reminder" />
                    </div>
                  </MobileRecordCard>
                ))}
              </MobileRecordList>

              <div className="hidden sm:block">
                <ReportTable>
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <Th>Order</Th>
                      <Th>Customer</Th>
                      <Th>Stage</Th>
                      {isVisible("delivery") && <Th>Delivery date</Th>}
                      <Th align="right">Balance</Th>
                      <Th align="right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <ReportTotalsRow>
                      <Td colSpan={isVisible("delivery") ? 4 : 3}>Total</Td>
                      <Td align="right">{inr(unpaidBalance)}</Td>
                      <Td align="right">—</Td>
                    </ReportTotalsRow>
                    {deliveredUnpaid.map((o) => (
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
                          <StageBadge stage={o.status} size="sm" />
                        </Td>
                        {isVisible("delivery") && <Td>{fmtDate(o.deliveryDate)}</Td>}
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
            </>
          )}
        </section>
      </div>
    </ReportShell>
  );
}
