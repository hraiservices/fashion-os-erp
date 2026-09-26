"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useEmployees } from "@/hooks/use-employees";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { getOverdueInProduction } from "@/lib/analytics";
import { STAGE_META, buildWhatsAppUrl, type Stage } from "@/lib/business-rules";
import { DEFAULT_STITCHING_WHATSAPP_TEMPLATES } from "@/lib/stitching-whatsapp";
import { fmtDate, inr } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StageBadge } from "@/components/orders/stage-badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { useTableSort } from "@/hooks/use-table-sort";

type OverdueRow = ReturnType<typeof getOverdueInProduction>[number];

const PRE_READY_STAGES: Stage[] = ["received", "cutting", "stitching", "finishing"];

// 1-3 days: still fresh, amber. 4-7: getting serious, orange. 8+: critical, red — same 3-tier
// escalation logic as dueBadge()'s urgent flag, just with more granularity since every row here
// is already overdue (dueBadge only distinguishes overdue-or-not).
function severityClass(daysLate: number): string {
  if (daysLate >= 8) return "font-semibold text-red-700 dark:text-red-400";
  if (daysLate >= 4) return "font-semibold text-orange-600 dark:text-orange-400";
  return "font-semibold text-amber-600 dark:text-amber-400";
}

const SEVERITY_BUCKETS = [
  { label: "1-3 days", min: 1, max: 3, color: "#D97706" },
  { label: "4-7 days", min: 4, max: 7, color: "#EA580C" },
  { label: "8-14 days", min: 8, max: 14, color: "#DC2626" },
  { label: "15+ days", min: 15, max: Infinity, color: "#991B1B" },
];

/** "Overdue" here means the order itself is running late — still in production past its
 *  promised delivery date — not a payment problem (see getOverdueInProduction's own comment for
 *  why Ready/Delivered/Payment orders are excluded; those are the LIVE Report's job). Always a
 *  live snapshot of right now, same as the LIVE Report and Tailor Payables, since "is this order
 *  late today" isn't a question a date-range filter makes sense for.
 *
 *  No day-over-day trend line — that would need a daily snapshot of overdue counts persisted
 *  somewhere, which doesn't exist yet (this report only ever reads live current state). The
 *  severity-bucket chart below is the closest live-data equivalent: how bad is today's backlog,
 *  broken into how-late-are-they instead of how it changed since yesterday. */
export default function OverdueOrdersPage() {
  const { orders, isLoading } = useReportsData();
  const { data: employees } = useEmployees();
  const { data: shop } = useShopSettings();
  const { data: waTemplates } = useAppSetting("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);

  const employeeNameById = useMemo(() => new Map((employees || []).map((e) => [e.id, e.name])), [employees]);

  function tailorName(id: string): string {
    if (!id) return "Unassigned";
    return employeeNameById.get(id) || id;
  }
  function garmentSummary(o: OverdueRow): string {
    return o.garments.map((g) => g.type).filter(Boolean).join(", ") || "—";
  }

  const SORT_COMPARATORS: Record<string, (a: OverdueRow, b: OverdueRow) => number> = {
    order: (a, b) => a.id.localeCompare(b.id),
    customer: (a, b) => a.name.localeCompare(b.name),
    stage: (a, b) => STAGE_META[a.status].label.localeCompare(STAGE_META[b.status].label),
    tailor: (a, b) => tailorName(a.tailor).localeCompare(tailorName(b.tailor)),
    garments: (a, b) => garmentSummary(a).localeCompare(garmentSummary(b)),
    deliveryDate: (a, b) => a.deliveryDate.localeCompare(b.deliveryDate),
    daysLate: (a, b) => a.daysLate - b.daysLate,
    balance: (a, b) => a.balance - b.balance,
  };
  const SORT_DESC_KEYS = new Set(["daysLate", "balance"]);
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<OverdueRow>("reports-overdue", SORT_COMPARATORS, SORT_DESC_KEYS);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const overdue = getOverdueInProduction(orders);
  const sortedOverdue = applySort(overdue);
  const byStage = PRE_READY_STAGES.map((stage) => ({
    stage,
    label: STAGE_META[stage].label,
    count: overdue.filter((o) => o.status === stage).length,
  })).filter((s) => s.count > 0);
  const bySeverity = SEVERITY_BUCKETS.map((b) => ({
    ...b,
    count: overdue.filter((o) => o.daysLate >= b.min && o.daysLate <= b.max).length,
  })).filter((b) => b.count > 0);
  const worstDaysLate = overdue[0]?.daysLate ?? 0;
  const totalBalance = overdue.reduce((s, o) => s + o.balance, 0);

  return (
    <ReportShell
      title="Overdue Orders"
      description="Still in production past the promised delivery date — worst delays first"
      actions={
        <ReportActionsMenu
          rows={sortedOverdue.map((o) => ({
            Order: o.id,
            Customer: o.name,
            Stage: STAGE_META[o.status].label,
            Tailor: tailorName(o.tailor),
            Garments: garmentSummary(o),
            "Delivery date": fmtDate(o.deliveryDate),
            "Days late": o.daysLate,
            Balance: o.balance,
          }))}
          filename="overdue-orders"
          title="Overdue Orders"
          summaryLines={[`Overdue orders: ${overdue.length}`, `Worst delay: ${worstDaysLate} day${worstDaysLate === 1 ? "" : "s"}`]}
        />
      }
    >
      {overdue.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Nothing overdue" description="Every in-production order is still within its delivery date." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Overdue orders" value={overdue.length} icon={AlertTriangle} tone="danger" />
            <StatCard label="Worst delay" value={`${worstDaysLate} day${worstDaysLate === 1 ? "" : "s"}`} icon={AlertTriangle} tone="danger" />
            {byStage.map((s) => (
              <StatCard key={s.stage} label={`Stuck in ${s.label}`} value={s.count} icon={AlertTriangle} />
            ))}
          </div>

          {bySeverity.length > 0 && (
            <ReportCard className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overdue orders by how late they are</p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySeverity} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                    <Tooltip
                      formatter={(v) => [v, "Orders"]}
                      contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {bySeverity.map((b) => (
                        <Cell key={b.label} fill={b.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportCard>
          )}

          <MobileRecordList>
            {sortedOverdue.map((o) => (
              <MobileRecordCard key={o.id}>
                <MobileRecordHeader
                  title={
                    <Link href={`/orders/${o.id}`} className="hover:underline">
                      {o.id}
                    </Link>
                  }
                  subtitle={`${o.name} · ${o.mobile}`}
                  value={<span className={severityClass(o.daysLate)}>{o.daysLate}d late</span>}
                  showChevron={false}
                />
                <MobileRecordRow label="Stage" value={<StageBadge stage={o.status} size="sm" />} />
                <MobileRecordRow label="Tailor" value={tailorName(o.tailor)} />
                <MobileRecordRow label="Garments" value={garmentSummary(o)} />
                <MobileRecordRow label="Delivery date" value={fmtDate(o.deliveryDate)} />
                <MobileRecordRow label="Balance" value={o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"} />
                <div className="flex justify-end border-t pt-1.5">
                  <WhatsAppIconButton href={buildWhatsAppUrl(o, "overdue", shop, waTemplates)} label={`Delay update to ${o.name}`} tone="reminder" />
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
                  <Th sortKey="stage" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Stage</Th>
                  <Th sortKey="tailor" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Tailor</Th>
                  <Th sortKey="garments" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Garments</Th>
                  <Th sortKey="deliveryDate" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Delivery date</Th>
                  <Th align="right" sortKey="daysLate" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Days late</Th>
                  <Th align="right" sortKey="balance" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Balance</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedOverdue.map((o) => (
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
                    <Td>{tailorName(o.tailor)}</Td>
                    <Td className="max-w-[14rem] truncate">{garmentSummary(o)}</Td>
                    <Td>{fmtDate(o.deliveryDate)}</Td>
                    <Td align="right" className={severityClass(o.daysLate)}>
                      {o.daysLate}d
                    </Td>
                    <Td align="right">{o.balance > 0 ? <BalanceDue amount={o.balance} /> : "—"}</Td>
                    <Td align="right">
                      <WhatsAppIconButton href={buildWhatsAppUrl(o, "overdue", shop, waTemplates)} label={`Delay update to ${o.name}`} tone="reminder" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          {totalBalance > 0 && (
            <p className="text-xs text-muted-foreground">{inr(totalBalance)} in combined balance also outstanding on these orders.</p>
          )}
        </>
      )}
    </ReportShell>
  );
}
