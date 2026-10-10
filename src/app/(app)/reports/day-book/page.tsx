"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ShoppingCart,
  Clock,
  Activity as ActivityIcon,
  ArrowUpDown,
  Search,
  Scissors,
  CheckCircle2,
  CalendarRange,
  MessageCircle,
  Copy,
  PackageCheck,
  FileSpreadsheet,
  LayoutGrid,
  List as ListIcon,
  X,
  AlertCircle,
} from "lucide-react";
import { FileTextDuotoneIcon, ReceiptDuotoneIcon, UsersDuotoneIcon, WalletDuotoneIcon } from "@/components/icons/duotone-icons";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDayBook, useDayBookRange, useCloseDay, useClosingHistory, useAddCashAdjustment, useRemoveCashAdjustment } from "@/hooks/use-day-book";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useTargetsSummary } from "@/hooks/use-targets";
import { dailyTargetFor } from "@/lib/targets";
import { exportXLSXMultiSheet } from "@/lib/export";
import { buildAccountantSheets } from "@/lib/day-book-insights";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { buildEndOfDaySummary, pctChange, summarizeByUser, type RangeDay } from "@/lib/day-book-extras";
import {
  AttendanceCard,
  BestWorstDays,
  CashAdjustmentsCard,
  CashPositionCard,
  CollectionsCard,
  DeliveriesCard,
  DiscountsCard,
  PaymentMethodsCard,
  ReviewStrip,
  SoldTodayCard,
  StaffSummaryCard,
  TargetCard,
  UnclosedBanner,
  VarianceHistoryCard,
  type DayBookTargets,
} from "@/components/reports/day-book-panels";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { DAY_BOOK_MODULE_ICONS, DAY_BOOK_MODULE_LABELS, fmtTime, type DayBookEntry, type DayBookModule, type TailorStageActivity, type TailorStageOrder } from "@/lib/day-book";
import { StageBadge } from "@/components/orders/stage-badge";
import { inr, fmtDate } from "@/lib/format";
import { toISODate } from "@/components/ui/date-picker";
import { ReportShell, ReportCard, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { useTableSort } from "@/hooks/use-table-sort";

type DayBookRow = DayBookEntry;

const SORT_COMPARATORS: Record<string, (a: DayBookRow, b: DayBookRow) => number> = {
  time: (a, b) => a.time.localeCompare(b.time),
  module: (a, b) => a.module.localeCompare(b.module),
  activity: (a, b) => a.activity.localeCompare(b.activity),
  details: (a, b) => a.description.localeCompare(b.description),
  amount: (a, b) => (a.amount ?? 0) - (b.amount ?? 0),

  user: (a, b) => a.user.localeCompare(b.user),
};
const SORT_DESC_KEYS = new Set(["amount"]);

function todayISO() {
  return toISODate(new Date());
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISODate(dt);
}

type ViewMode = "day" | "week" | "month";
type CompareBase = "yesterday" | "lastWeek";

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Inclusive date bounds of the week (Mon–Sun) or month containing `iso`. */
function rangeFor(iso: string, mode: ViewMode): { from: string; to: string } {
  const d = parseISO(iso);
  if (mode === "month") return { from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), to: toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toISODate(monday), to: toISODate(sunday) };
}

function stepDate(iso: string, mode: ViewMode, dir: -1 | 1): string {
  if (mode === "day") return shiftDate(iso, dir);
  if (mode === "week") return shiftDate(iso, 7 * dir);
  const d = parseISO(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + dir, 1));
}

/** Financial-chart bar label → the Day Book module its click filters the timeline to. */
const CHART_MODULE: Record<string, DayBookModule> = { Sales: "sales", Payments: "payments", Purchases: "purchases", Expenses: "expenses" };

const MODULES: DayBookModule[] = ["sales", "payments", "expenses", "purchases", "stitching", "customers", "attendance", "payroll", "other"];

function TailorOrderList({ label, icon: Icon, orders }: { label: string; icon: typeof Scissors; orders: TailorStageOrder[] }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {label} ({orders.length})
      </p>
      {orders.length === 0 ? (
        <p className="pl-5 text-xs text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-1 pl-5">
          {orders.map((o) => (
            <li key={o.orderId} className="flex flex-wrap items-center gap-2 text-sm">
              <Link href={`/orders/${o.orderId}`} className="font-medium text-primary hover:underline">
                {o.customerName}
              </Link>
              <span className="text-xs text-muted-foreground">{o.orderId}</span>
              <StageBadge stage={o.status} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STAGE_STEPS: { key: "receivedToCutting" | "cuttingToStitching" | "stitchingToFinishing" | "finishingToReady"; label: string; icon: typeof Scissors }[] = [
  { key: "receivedToCutting", label: "Received → Cutting", icon: Scissors },
  { key: "cuttingToStitching", label: "Cutting → Stitching", icon: Scissors },
  { key: "stitchingToFinishing", label: "Stitching → Finishing", icon: CheckCircle2 },
  { key: "finishingToReady", label: "Finishing → Ready", icon: PackageCheck },
];

/** A stage count as a small clickable chip — clicking it selects this tailor (filtering the
 *  timeline below to their touched orders, same as clicking the card itself) and expands the
 *  card to show every group's order list, this one included — "click a number to see those
 *  orders" without a separate isolated-scroll mechanism for each of the three counts. */
function StageCountChip({ label, icon: Icon, count, onClick }: { label: string; icon: typeof Scissors; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors",
        count > 0 ? "bg-primary/10 text-primary hover:bg-primary/20" : "bg-muted text-muted-foreground"
      )}
      title={`${label}: ${count} today`}
    >
      <Icon className="size-3" />
      {count}
    </button>
  );
}

function TailorActivityCard({
  tailor,
  selected,
  expanded,
  onToggleSelect,
  onExpandWith,
}: {
  tailor: TailorStageActivity;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onExpandWith: () => void;
}) {
  const idle = tailor.totalActions === 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggleSelect()}
      className={cn(
        "cursor-pointer space-y-3 rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
        idle && !selected && "border-destructive/30 bg-destructive/5"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{tailor.tailorName}</p>
        <div className="flex items-center gap-2">
          {tailor.piecesReady > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <PackageCheck className="size-3" /> {tailor.piecesReady} {tailor.piecesReady === 1 ? "pc" : "pcs"}
            </span>
          )}
          {tailor.payableToday > 0 && (
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{inr(tailor.payableToday)} payable</span>
          )}
          {(tailor.paidToday ?? 0) > 0 && <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">{inr(tailor.paidToday ?? 0)} paid out</span>}
          {idle ? (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="size-3" /> No activity today
            </Badge>
          ) : (
            <Badge variant="secondary">{tailor.totalActions} {tailor.totalActions === 1 ? "action" : "actions"}</Badge>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {STAGE_STEPS.map((s) => (
          <StageCountChip key={s.key} label={s.label} icon={s.icon} count={tailor[s.key]} onClick={onExpandWith} />
        ))}
      </div>
      {expanded && (
        <div className="space-y-3 border-t pt-3" onClick={(e) => e.stopPropagation()}>
          {STAGE_STEPS.map((s) => (
            <TailorOrderList key={s.key} label={s.label} icon={s.icon} orders={tailor[`${s.key}Orders`]} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DayBookPage() {
  const { data: user } = useCurrentUser();
  const [date, setDate] = useState(todayISO());
  const [moduleFilter, setModuleFilter] = useState<DayBookModule | "all">("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [mode, setMode] = useState<ViewMode>("day");
  const [compare, setCompare] = useState<CompareBase>("yesterday");
  const { data: shop } = useShopSettings();
  const closeDay = useCloseDay();
  const addAdjustment = useAddCashAdjustment();
  const history = useClosingHistory();
  const { data: targets, save: saveTargets } = useAppSetting<DayBookTargets>("dayBookTargets", { billed: 0, collected: 0 });
  // A shop-wide sales target in Targets (when this user can read it) sets the day's billed target.
  const targetsSummary = useTargetsSummary({ quiet: true }).data;
  const fromTargets = targetsSummary ? dailyTargetFor(targetsSummary.targets, date) : null;
  const timelineRef = useRef<HTMLDivElement>(null);
  const [tailorView, setTailorView] = useState<"cards" | "list">("cards");
  const [selectedTailorId, setSelectedTailorId] = useState<string | null>(null);
  const [expandedTailorId, setExpandedTailorId] = useState<string | null>(null);

  const canView = !!user?.perms.viewReports;
  // Profit is restricted to the admin role specifically — the rest of the Day Book (sales,
  // payments, expenses, activity) stays visible to any manager who can already view reports.
  const canViewProfit = !!user?.perms.viewFinancialReports;
  const { data, isLoading, isError, error } = useDayBook(date);
  const range = useMemo(() => rangeFor(date, mode), [date, mode]);
  const rangeQuery = useDayBookRange(range.from, range.to, mode !== "day");
  const removeAdjustment = useRemoveCashAdjustment(date);
  const isAdmin = user?.role === "admin";
  const canClose = !!user?.perms.managePayments || isAdmin;
  // Trend data for the KPI sparklines (last 7 days ending on the selected date) and the
  // best/slowest-day line (the selected date's month) — only needed in single-day mode.
  const sparkRange = useDayBookRange(shiftDate(date, -6), date, mode === "day");
  const monthRange = useDayBookRange(rangeFor(date, "month").from, rangeFor(date, "month").to, mode === "day");
  const isToday = date === todayISO();
  const staffRows = useMemo(() => summarizeByUser(data?.entries || []), [data]);

  const entries = useMemo(() => data?.entries || [], [data]);

  const distinctUsers = useMemo(() => {
    const set = new Set(entries.map((e) => e.user).filter((u) => u && u !== "—"));
    return Array.from(set).sort();
  }, [entries]);

  const selectedTailor = useMemo(
    () => data?.tailorActivity.find((t) => t.tailorId === selectedTailorId) || null,
    [data, selectedTailorId]
  );

  // Every order this tailor's garments moved through a tracked transition on today — clicking a
  // tailor card filters the timeline below to just these (Order Edited/Stage Changed/Payment
  // Collected rows all key off this same order id via DayBookEntry.reference), so "what did this
  // tailor's work touch today" reads directly off the normal activity feed instead of a second,
  // separate list.
  const selectedTailorOrderIds = useMemo(() => {
    if (!selectedTailor) return null;
    const ids = new Set<string>();
    for (const o of [...selectedTailor.receivedToCuttingOrders, ...selectedTailor.cuttingToStitchingOrders, ...selectedTailor.stitchingToFinishingOrders, ...selectedTailor.finishingToReadyOrders]) {
      ids.add(o.orderId);
    }
    return ids;
  }, [selectedTailor]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = minAmount ? parseFloat(minAmount) : null;
    const max = maxAmount ? parseFloat(maxAmount) : null;
    let rows = entries;
    if (selectedTailorOrderIds) rows = rows.filter((e) => e.reference && selectedTailorOrderIds.has(e.reference));
    if (moduleFilter !== "all") rows = rows.filter((e) => e.module === moduleFilter);
    if (userFilter !== "all") rows = rows.filter((e) => e.user === userFilter);
    if (min != null) rows = rows.filter((e) => (e.amount ?? 0) >= min);
    if (max != null) rows = rows.filter((e) => (e.amount ?? 0) <= max);
    if (q) {
      rows = rows.filter((e) =>
        [e.reference, e.customer, e.vendor, e.employee, e.user, e.description, e.activity].some((f) => f?.toLowerCase().includes(q))
      );
    }
    const sorted = [...rows].sort((a, b) => a.time.localeCompare(b.time));
    return sortOrder === "desc" ? sorted.reverse() : sorted;
  }, [entries, selectedTailorOrderIds, moduleFilter, userFilter, sortOrder, search, minAmount, maxAmount]);

  function toggleTailorSelect(tailorId: string) {
    setSelectedTailorId((cur) => (cur === tailorId ? null : tailorId));
    setExpandedTailorId((cur) => (cur === tailorId ? null : tailorId));
  }

  function expandTailorWith(tailorId: string) {
    setSelectedTailorId(tailorId);
    setExpandedTailorId(tailorId);
  }

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<DayBookRow>("day-book", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedFiltered = applySort(filtered);

  const moduleCounts = useMemo(() => {
    const counts = new Map<DayBookModule, number>();
    for (const e of entries) counts.set(e.module, (counts.get(e.module) || 0) + 1);
    return MODULES.map((m) => ({ module: m, label: DAY_BOOK_MODULE_LABELS[m], count: counts.get(m) || 0 })).filter((r) => r.count > 0);
  }, [entries]);

  const financialChartData = data
    ? [
        { name: "Sales", value: data.totals.sales, color: "#0ea5e9" },
        { name: "Payments", value: data.totals.payments, color: "#059669" },
        { name: "Purchases", value: data.totals.purchases, color: "#f59e0b" },
        { name: "Expenses", value: data.totals.expenses, color: "#ef4444" },
        { name: "Refunds", value: data.totals.refunds, color: "#a855f7" },
        ...(canViewProfit
          ? [
              { name: "Stitching Rev", value: data.totals.stitchingRevenue, color: "#0ea5e9" },
              { name: "Stitching Cost", value: data.totals.stitchingCost, color: "#ef4444" },
              { name: "Profit", value: data.totals.profit, color: data.totals.profit >= 0 ? "#059669" : "#ef4444" },
            ]
          : []),
      ]
    : [];

  function delta(key: "totalBilled" | "sales" | "payments" | "purchases" | "expenses" | "refunds", current: number, goodWhenUp = true) {
    if (!data) return undefined;
    const base = compare === "yesterday" ? data.comparison.yesterday : data.comparison.lastWeek;
    return { pct: pctChange(current, base[key]), label: compare === "yesterday" ? "yesterday" : "last week", goodWhenUp };
  }

  /** Series for a KPI sparkline from the 7-day range query. */
  function spark(key: "totalBilled" | "sales" | "payments" | "purchases" | "expenses" | "refunds"): number[] | undefined {
    return sparkRange.data?.days.map((d) => d[key]);
  }

  /** Click a KPI card / chart bar → filter the timeline to that module and jump to it. */
  function focusModule(m: DayBookModule) {
    setModuleFilter(m);
    setTimeout(() => timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function downloadAccountantPack() {
    if (!data) return;
    const sheets = buildAccountantSheets({
      date,
      entries, // the full day, not whatever the on-screen filters currently show
      summary: [
        { label: "Date", value: date },
        { label: "Total billed", value: data.totals.totalBilled },
        { label: "Retail sales", value: data.totals.sales },
        { label: "Stitching billed", value: data.totals.stitchingRevenue },
        { label: "Payments received", value: data.totals.payments },
        { label: "Purchases", value: data.totals.purchases },
        { label: "Expenses", value: data.totals.expenses },
        { label: "Refunds / credits", value: data.totals.refunds },
        { label: "Discounts given", value: data.discounts.total },
      ],
      split: data.paymentMethods,
      cash: data.cash,
      closing: data.closing,
      adjustments: data.adjustments,
    });
    await exportXLSXMultiSheet(sheets, `day-book-accountant-${date}`);
  }

  function copySummary(openWhatsApp: boolean) {
    if (!data) return;
    const text = buildEndOfDaySummary({
      date,
      shopName: shop?.name,
      sales: data.totals.sales,
      stitchingBilled: data.totals.stitchingRevenue,
      payments: data.totals.payments,
      expenses: data.totals.expenses,
      purchases: data.totals.purchases,
      split: data.paymentMethods,
      cash: data.cash,
      closing: data.closing,
      ordersCreated: data.totals.ordersCreated,
      deliveredToday: data.deliveries.deliveredToday.length,
      dueToday: data.deliveries.dueToday.length,
      overdue: data.deliveries.overdue.length,
      unpaidOnDelivered: data.deliveries.unpaidOnDeliveredToday,
    });
    if (openWhatsApp) {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    } else {
      navigator.clipboard?.writeText(text).then(
        () => toast.success("Summary copied"),
        () => toast.error("Couldn't copy — select and copy manually")
      );
    }
  }

  if (!canView) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={CalendarDays} title="No access" description="The Day Book is restricted to users who can view reports." />
      </div>
    );
  }

  const exportRows = sortedFiltered.map((e) => ({
    Date: date,
    Time: fmtTime(e.time),
    Module: DAY_BOOK_MODULE_LABELS[e.module],
    Activity: e.activity,
    Reference: e.reference || "",
    Customer: e.customer || "",
    Vendor: e.vendor || "",
    Employee: e.employee || "",
    Amount: e.amount ?? "",
    User: e.user,
    Description: e.description,
  }));

  return (
    <ReportShell
      title="Day Book"
      description="Everything that happened in the system on the selected date, across every module."
      actions={
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <SegmentedToggle
            ariaLabel="Day book range"
            value={mode}
            onChange={setMode}
            options={[
              { value: "day", label: "Day", icon: CalendarDays },
              { value: "week", label: "Week", icon: CalendarRange },
              { value: "month", label: "Month", icon: CalendarRange },
            ]}
          />
          <Button variant="outline" size="sm" onClick={() => setDate((d) => stepDate(d, mode, -1))} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <DatePicker value={date} onChange={setDate} className="w-40" />
          <Button variant="outline" size="sm" onClick={() => setDate((d) => stepDate(d, mode, 1))} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDate(todayISO())}>
            Today
          </Button>
          <ReportActionsMenu
            rows={exportRows}
            filename={`day-book-${date}`}
            title={`Day Book — ${fmtDate(date)}`}
            summaryLines={[
              `Date: ${fmtDate(date)}`,
              `Total billed: ${inr(data?.totals.totalBilled ?? 0)}`,
              `Sales: ${inr(data?.totals.sales ?? 0)}`,
              `Payments: ${inr(data?.totals.payments ?? 0)}`,
              `Expenses: ${inr(data?.totals.expenses ?? 0)}`,
              ...(data ? [`Expected cash: ${inr(data.cash.expected)}`, ...(data.closing ? [`Counted cash: ${inr(data.closing.countedCash)}`] : [])] : []),
            ]}
          />
        </div>
      }
    >
      <p className="text-sm font-medium text-muted-foreground print:block hidden">{fmtDate(date)}</p>

      {mode !== "day" && (
        <>
          <p className="text-sm font-medium text-muted-foreground">
            {fmtDate(range.from)} – {fmtDate(range.to)}
          </p>
          {rangeQuery.isLoading && <Skeleton className="h-96 w-full" />}
          {rangeQuery.isError && (
            <EmptyState icon={CalendarDays} title="Couldn't load this range" description={rangeQuery.error instanceof Error ? rangeQuery.error.message : "Try again."} />
          )}
          {rangeQuery.data && (
            <RangeView
              days={rangeQuery.data.days}
              onPickDay={(d) => {
                setDate(d);
                setMode("day");
              }}
            />
          )}
        </>
      )}

      {mode === "day" && isLoading && <Skeleton className="h-96 w-full" />}

      {mode === "day" && isError && (
        <EmptyState icon={CalendarDays} title="Couldn't load the Day Book" description={error instanceof Error ? error.message : "Try again."} />
      )}

      {mode === "day" && data && (
        <>
          <UnclosedBanner
            days={(history.data?.unclosedDays || []).filter((d) => d !== date)}
            onPick={(d) => setDate(d)}
          />

          {/* End-of-day tools + comparison basis */}
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <SegmentedToggle
              ariaLabel="Compare against"
              value={compare}
              onChange={setCompare}
              options={[
                { value: "yesterday", label: "vs yesterday" },
                { value: "lastWeek", label: "vs last week" },
              ]}
            />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadAccountantPack}>
                <FileSpreadsheet className="size-4" /> Accountant Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => copySummary(false)}>
                <Copy className="size-4" /> Copy summary
              </Button>
              <Button size="sm" onClick={() => copySummary(true)}>
                <MessageCircle className="size-4" /> Send on WhatsApp
              </Button>
            </div>
          </div>

          {/* Financial KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <StatCard label="Total Billed" value={inr(data.totals.totalBilled)} icon={FileTextDuotoneIcon} tone="default" delta={delta("totalBilled", data.totals.totalBilled)} spark={spark("totalBilled")} />
            <StatCard label="Sales" value={inr(data.totals.sales)} icon={ReceiptDuotoneIcon} tone="default" delta={delta("sales", data.totals.sales)} spark={spark("sales")} onClick={() => focusModule("sales")} />
            <StatCard label="Payments Received" value={inr(data.totals.payments)} icon={Banknote} tone="success" delta={delta("payments", data.totals.payments)} spark={spark("payments")} onClick={() => focusModule("payments")} />
            <StatCard label="Purchases" value={inr(data.totals.purchases)} icon={ShoppingCart} tone="default" delta={delta("purchases", data.totals.purchases, false)} spark={spark("purchases")} onClick={() => focusModule("purchases")} />
            <StatCard label="Expenses" value={inr(data.totals.expenses)} icon={WalletDuotoneIcon} tone="danger" delta={delta("expenses", data.totals.expenses, false)} spark={spark("expenses")} onClick={() => focusModule("expenses")} />
            <StatCard label="Refunds" value={inr(data.totals.refunds)} icon={RotateCcw} tone="warning" delta={delta("refunds", data.totals.refunds, false)} spark={spark("refunds")} />
            {canViewProfit && (
              <StatCard label="Profit" value={inr(data.totals.profit)} icon={data.totals.profit >= 0 ? TrendingUp : TrendingDown} tone={data.totals.profit >= 0 ? "success" : "danger"} />
            )}
          </div>

          {/* Profit above folds in stitching-order revenue/cost that Sales/Expenses never
              show (Sales is retail invoices only) — these two make it traceable back to the
              stitching orders created/costed today, same fields Combined P&L already shows. */}
          {canViewProfit && (data.totals.stitchingRevenue > 0 || data.totals.stitchingCost > 0) && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Stitching Revenue" value={inr(data.totals.stitchingRevenue)} icon={Scissors} tone="default" />
              <StatCard label="Stitching Cost" value={inr(data.totals.stitchingCost)} icon={WalletDuotoneIcon} tone="danger" />
              {data.totals.laborCost > 0 && <StatCard label="Mfg Labor" value={inr(data.totals.laborCost)} icon={WalletDuotoneIcon} tone="danger" />}
              {data.totals.salariesCost > 0 && <StatCard label="Salaries" value={inr(data.totals.salariesCost)} icon={WalletDuotoneIcon} tone="danger" />}
            </div>
          )}

          {/* Operational KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Invoices Created" value={data.totals.invoicesCreated} icon={FileTextDuotoneIcon} />
            <StatCard label="Orders Created" value={data.totals.ordersCreated} icon={ReceiptDuotoneIcon} onClick={() => focusModule("stitching")} />
            <StatCard label="Customers Added" value={data.totals.customersAdded} icon={UsersDuotoneIcon} onClick={() => focusModule("customers")} />
            <StatCard label="Attendance Events" value={data.totals.attendanceEvents} icon={Clock} onClick={() => focusModule("attendance")} />
            <StatCard label="Total Activities" value={data.totals.totalActivities} icon={ActivityIcon} />
          </div>

          {monthRange.data && <BestWorstDays days={monthRange.data.days} today={todayISO()} />}

          <TargetCard
            billed={data.totals.totalBilled}
            collected={data.totals.payments}
            targets={{ billed: fromTargets?.value ?? targets?.billed ?? 0, collected: targets?.collected ?? 0 }}
            billedFrom={fromTargets?.title}
            canEdit={isAdmin}
            onSave={(t) => saveTargets.mutate(fromTargets ? { ...t, billed: targets?.billed ?? 0 } : t, { onSuccess: () => toast.success("Targets saved"), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save targets") })}
          />

          <ReviewStrip flags={data.reviewFlags} />

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="space-y-4">
            <CashPositionCard
              date={date}
              cash={data.cash}
              closing={data.closing}
              canClose={canClose}
              isAdmin={isAdmin}
              busy={closeDay.isPending}
              onClose={(countedCash, note) =>
                closeDay.mutate(
                  { date, countedCash, note },
                  {
                    onSuccess: (r) => toast.success(r.variance === 0 ? "Day closed — cash matches" : `Day closed — ${r.variance > 0 ? "over" : "short"} by ${inr(Math.abs(r.variance))}`),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to close the day"),
                  }
                )
              }
            />
            <CashAdjustmentsCard
              date={date}
              adjustments={data.adjustments}
              closed={!!data.closing}
              canEdit={canClose}
              isAdmin={isAdmin}
              busy={addAdjustment.isPending || removeAdjustment.isPending}
              onAdd={(a) =>
                addAdjustment.mutate(
                  { date, ...a },
                  {
                    onSuccess: () => toast.success("Cash entry recorded"),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to record"),
                  }
                )
              }
              onRemove={(id) =>
                removeAdjustment.mutate(id, {
                  onSuccess: () => toast.success("Removed"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
                })
              }
            />
            </div>
            <div className="space-y-4">
              <PaymentMethodsCard split={data.paymentMethods} />
              <VarianceHistoryCard history={history.data} />
            </div>
          </div>

          <DeliveriesCard board={data.deliveries} isToday={isToday} />

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <CollectionsCard data={data.collections} date={date} shopName={shop?.name} shopPhone={shop?.phone} />
            <div className="space-y-4">
              <SoldTodayCard sold={data.soldToday} />
              <DiscountsCard discounts={data.discounts} />
            </div>
          </div>

          <AttendanceCard board={data.attendance} />

          {/* Tailor activity — exactly what each tailor moved forward today (and, just as
              important, who moved nothing), so it can be read out to them directly ("you moved
              N to Finishing and M to Ready today, ₹X payable") or used to follow up on someone
              who didn't. Click a tailor (or any of their stage-count chips) to filter the
              timeline below to only the orders their work touched today; click again to clear. */}
          {data.tailorActivity.length > 0 && (
            <ReportCard className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tailor Activity Today</p>
                <div className="flex items-center gap-2">
                  {selectedTailor && (
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => toggleTailorSelect(selectedTailor.tailorId)}>
                      <X className="size-3" /> Clear filter: {selectedTailor.tailorName}
                    </Button>
                  )}
                  <div className="flex items-center rounded-md border p-0.5">
                    <Button
                      variant={tailorView === "cards" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setTailorView("cards")}
                    >
                      <LayoutGrid className="size-3.5" /> Cards
                    </Button>
                    <Button
                      variant={tailorView === "list" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setTailorView("list")}
                    >
                      <ListIcon className="size-3.5" /> List
                    </Button>
                  </div>
                </div>
              </div>

              {/* The two numbers directly asked for — orders that finished stitching today and
                  orders marked Ready today — plus the third tracked step, all summed across every
                  tailor so they read as one shop-wide total regardless of who did them. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label="Moved to Cutting"
                  value={data.tailorActivity.reduce((s, t) => s + t.receivedToCutting, 0)}
                  icon={Scissors}
                />
                <StatCard
                  label="Moved to Stitching"
                  value={data.tailorActivity.reduce((s, t) => s + t.cuttingToStitching, 0)}
                  icon={Scissors}
                />
                <StatCard
                  label="Stitching Completed"
                  value={data.tailorActivity.reduce((s, t) => s + t.stitchingToFinishing, 0)}
                  icon={CheckCircle2}
                  tone="success"
                />
                <StatCard
                  label="Marked Ready"
                  value={data.tailorActivity.reduce((s, t) => s + t.finishingToReady, 0)}
                  icon={PackageCheck}
                  tone="success"
                />
              </div>

              {tailorView === "cards" ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.tailorActivity.map((t) => (
                    <TailorActivityCard
                      key={t.tailorId}
                      tailor={t}
                      selected={selectedTailorId === t.tailorId}
                      expanded={expandedTailorId === t.tailorId}
                      onToggleSelect={() => toggleTailorSelect(t.tailorId)}
                      onExpandWith={() => expandTailorWith(t.tailorId)}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {data.tailorActivity.map((t) => (
                    <div
                      key={t.tailorId}
                      onClick={() => toggleTailorSelect(t.tailorId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleTailorSelect(t.tailorId)}
                      className={cn(
                        "cursor-pointer space-y-3 rounded-lg border p-3 transition-colors",
                        selectedTailorId === t.tailorId ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                        t.totalActions === 0 && selectedTailorId !== t.tailorId && "border-destructive/30 bg-destructive/5"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{t.tailorName}</p>
                        <div className="flex items-center gap-2">
                          {t.piecesReady > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <PackageCheck className="size-3" /> {t.piecesReady} {t.piecesReady === 1 ? "piece" : "pieces"} ready
                            </span>
                          )}
                          {t.payableToday > 0 && (
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{inr(t.payableToday)} payable today</span>
                          )}
                          {(t.paidToday ?? 0) > 0 && <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">{inr(t.paidToday ?? 0)} paid out</span>}
                          {t.totalActions === 0 && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="size-3" /> No activity today
                            </Badge>
                          )}
                        </div>
                      </div>
                      {STAGE_STEPS.map((s) => (
                        <TailorOrderList key={s.key} label={s.label} icon={s.icon} orders={t[`${s.key}Orders`]} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </ReportCard>
          )}

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportCard className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Financial Summary</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financialChartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <Tooltip formatter={(v) => inr(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }} />
                    <Bar
                      dataKey="value"
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      onClick={(d: unknown) => {
                        const m = CHART_MODULE[(d as { name?: string }).name || ""];
                        if (m) focusModule(m);
                      }}
                    >
                      {financialChartData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportCard>

            <ReportCard className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity by Module</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moduleCounts} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
                    <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={11} width={80} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }} />
                    <Bar
                      dataKey="count"
                      fill="#0ea5e9"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={(d: unknown) => {
                        const m = (d as { module?: DayBookModule }).module;
                        if (m) focusModule(m);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportCard>
          </div>

          <StaffSummaryCard rows={staffRows} />

          <div ref={timelineRef} className="scroll-mt-20" />

          {/* Filters */}
          <ReportCard className="flex flex-wrap items-center gap-2 p-3 print:hidden">
            {selectedTailor && (
              <Badge variant="secondary" className="h-7 gap-1.5 pl-2.5">
                Tailor: {selectedTailor.tailorName}
                <button type="button" onClick={() => toggleTailorSelect(selectedTailor.tailorId)} aria-label="Clear tailor filter" className="rounded-full p-0.5 hover:bg-muted-foreground/20">
                  <X className="size-3" />
                </button>
              </Badge>
            )}
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" enterKeyHint="search" placeholder="Search reference, name, description…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-8" />
            </div>
            <Select value={moduleFilter} onValueChange={(v) => v && setModuleFilter(v as DayBookModule | "all")}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue>{moduleFilter === "all" ? "All Modules" : DAY_BOOK_MODULE_LABELS[moduleFilter]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {MODULES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {DAY_BOOK_MODULE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={(v) => v && setUserFilter(v)}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue>{userFilter === "all" ? "All Users" : userFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {distinctUsers.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Min ₹" type="number" inputMode="decimal" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="h-9 w-24" />
            <Input placeholder="Max ₹" type="number" inputMode="decimal" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="h-9 w-24" />
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
            >
              <ArrowUpDown className="size-3.5" />
              {sortOrder === "asc" ? "Oldest first" : "Latest first"}
            </Button>
          </ReportCard>

          {/* Timeline */}
          {filtered.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No activity" description="Nothing matches the current filters for this date." />
          ) : (
            <>
              <div className="hidden sm:block">
                <ReportTable>
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <Th sortKey="time" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Time</Th>
                      <Th sortKey="module" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Module</Th>
                      <Th sortKey="activity" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Activity</Th>
                      <Th sortKey="details" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Details</Th>
                      <Th align="right" sortKey="amount" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Amount</Th>
                      <Th sortKey="user" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>User</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <ReportTotalsRow>
                      <Td colSpan={4}>{filtered.length} {filtered.length === 1 ? "entry" : "entries"}</Td>
                      <Td align="right">{inr(filtered.reduce((s, e) => s + (e.amount || 0), 0))}</Td>
                      <Td />
                    </ReportTotalsRow>
                    {sortedFiltered.map((e) => {
                      const Icon = DAY_BOOK_MODULE_ICONS[e.module];
                      return (
                        <tr key={e.id} className="hover:bg-muted/30">
                          <Td className="whitespace-nowrap font-medium tabular-nums">{fmtTime(e.time)}</Td>
                          <Td>
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                              <Icon className="size-3.5" />
                              {DAY_BOOK_MODULE_LABELS[e.module]}
                            </span>
                          </Td>
                          <Td className="whitespace-nowrap">{e.activity}</Td>
                          <Td className="max-w-md">
                            {e.referenceHref ? (
                              <Link href={e.referenceHref} className="font-medium text-primary hover:underline">
                                {e.reference ? `${e.reference} — ` : ""}
                                {e.description}
                              </Link>
                            ) : (
                              <span>{e.description}</span>
                            )}
                          </Td>
                          <Td align="right" className={cn("whitespace-nowrap", e.amount != null && "font-medium")}>
                            {e.amount != null ? inr(e.amount) : "—"}
                          </Td>
                          <Td className="whitespace-nowrap text-muted-foreground">{e.user}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ReportTable>
              </div>

              <MobileRecordList>
                <MobileRecordCard className="bg-muted/40">
                  <MobileRecordHeader
                    boldTitle title={`${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`}
                    value={inr(filtered.reduce((s, e) => s + (e.amount || 0), 0))}
                    showChevron={false}
                  />
                </MobileRecordCard>
                {sortedFiltered.map((e) => {
                  const Icon = DAY_BOOK_MODULE_ICONS[e.module];
                  return (
                    <MobileRecordCard key={e.id} href={e.referenceHref || undefined}>
                      <MobileRecordHeader
                        boldTitle title={e.activity}
                        subtitle={fmtTime(e.time)}
                        value={e.amount != null ? inr(e.amount) : "—"}
                        showChevron={!!e.referenceHref}
                      />
                      <MobileRecordRow
                        label="Module"
                        value={
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                            <Icon className="size-3.5" />
                            {DAY_BOOK_MODULE_LABELS[e.module]}
                          </span>
                        }
                      />
                      <MobileRecordRow label="Details" value={<span className="text-right">{e.reference ? `${e.reference} — ` : ""}{e.description}</span>} />
                      <MobileRecordRow label="User" value={e.user} />
                    </MobileRecordCard>
                  );
                })}
              </MobileRecordList>
            </>
          )}

          {/* Print-only closing block — the signed sheet for the accountant. */}
          <div className="mt-10 hidden space-y-6 print:block">
            <p className="text-sm">
              Cash: opening {inr(data.cash.opening)} + received {inr(data.cash.cashIn)} − paid out {inr(data.cash.cashOut)} = expected {inr(data.cash.expected)}
              {data.closing ? ` · counted ${inr(data.closing.countedCash)} · ${data.closing.variance === 0 ? "matches" : `${data.closing.variance > 0 ? "over" : "short"} by ${inr(Math.abs(data.closing.variance))}`}` : " · day not closed"}
            </p>
            <div className="grid grid-cols-3 gap-8 pt-8 text-xs text-muted-foreground">
              {["Prepared by", "Verified by", "Owner"].map((label) => (
                <div key={label} className="border-t border-foreground/40 pt-1.5">
                  {label}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </ReportShell>
  );
}

function RangeView({ days, onPickDay }: { days: RangeDay[]; onPickDay: (date: string) => void }) {
  const totals = days.reduce(
    (t, d) => ({
      totalBilled: t.totalBilled + d.totalBilled,
      sales: t.sales + d.sales,
      payments: t.payments + d.payments,
      expenses: t.expenses + d.expenses,
      purchases: t.purchases + d.purchases,
      refunds: t.refunds + d.refunds,
      cashIn: t.cashIn + d.cashIn,
    }),
    { totalBilled: 0, sales: 0, payments: 0, expenses: 0, purchases: 0, refunds: 0, cashIn: 0 }
  );
  const chart = days.map((d) => ({ ...d, label: `${d.date.slice(8)}/${d.date.slice(5, 7)}` }));
  const exportRows = days.map((d) => ({ Date: d.date, "Total billed": d.totalBilled, Sales: d.sales, Payments: d.payments, "Cash in": d.cashIn, Expenses: d.expenses, Purchases: d.purchases, Refunds: d.refunds }));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Total Billed" value={inr(totals.totalBilled)} icon={FileTextDuotoneIcon} />
        <StatCard label="Sales" value={inr(totals.sales)} icon={ReceiptDuotoneIcon} />
        <StatCard label="Payments Received" value={inr(totals.payments)} icon={Banknote} tone="success" />
        <StatCard label="Cash In" value={inr(totals.cashIn)} icon={WalletDuotoneIcon} tone="success" />
        <StatCard label="Purchases" value={inr(totals.purchases)} icon={ShoppingCart} />
        <StatCard label="Expenses" value={inr(totals.expenses)} icon={WalletDuotoneIcon} tone="danger" />
        <StatCard label="Refunds" value={inr(totals.refunds)} icon={RotateCcw} tone="warning" />
      </div>

      <ReportCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Daily billed vs collected vs spent</p>
          <ReportActionsMenu
            rows={exportRows}
            filename={`day-book-${days[0]?.date}-to-${days[days.length - 1]?.date}`}
            title="Day Book — range"
            summaryLines={[`Billed: ${inr(totals.totalBilled)}`, `Collected: ${inr(totals.payments)}`, `Expenses: ${inr(totals.expenses)}`]}
          />
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip formatter={(v) => inr(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }} />
              <Bar dataKey="totalBilled" name="Billed" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
              <Bar dataKey="payments" name="Collected" fill="#059669" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <ReportTable>
        <thead className="border-b bg-muted/40">
          <tr>
            <Th>Date</Th>
            <Th align="right">Billed</Th>
            <Th align="right">Collected</Th>
            <Th align="right">Cash in</Th>
            <Th align="right">Expenses</Th>
            <Th align="right">Purchases</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <ReportTotalsRow>
            <Td>Total</Td>
            <Td align="right">{inr(totals.totalBilled)}</Td>
            <Td align="right">{inr(totals.payments)}</Td>
            <Td align="right">{inr(totals.cashIn)}</Td>
            <Td align="right">{inr(totals.expenses)}</Td>
            <Td align="right">{inr(totals.purchases)}</Td>
          </ReportTotalsRow>
          {days.map((d) => (
            <tr key={d.date} className="cursor-pointer hover:bg-muted/30" onClick={() => onPickDay(d.date)}>
              <Td className="whitespace-nowrap font-medium text-primary">{fmtDate(d.date)}</Td>
              <Td align="right">{inr(d.totalBilled)}</Td>
              <Td align="right">{inr(d.payments)}</Td>
              <Td align="right">{inr(d.cashIn)}</Td>
              <Td align="right">{inr(d.expenses)}</Td>
              <Td align="right">{inr(d.purchases)}</Td>
            </tr>
          ))}
        </tbody>
      </ReportTable>
      <p className="text-xs text-muted-foreground print:hidden">Tap a date to open that day in full.</p>
    </>
  );
}
