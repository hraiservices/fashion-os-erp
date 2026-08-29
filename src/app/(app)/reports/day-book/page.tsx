"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  RotateCcw,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  FileText,
  ShoppingCart,
  Users,
  Clock,
  Activity as ActivityIcon,
  ArrowUpDown,
  Search,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDayBook } from "@/hooks/use-day-book";
import { DAY_BOOK_MODULE_ICONS, DAY_BOOK_MODULE_LABELS, fmtTime, type DayBookModule } from "@/lib/day-book";
import { inr, fmtDate } from "@/lib/format";
import { toISODate } from "@/components/ui/date-picker";
import { ReportShell, ReportCard, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportMenu } from "@/components/ui/export-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { cn } from "@/lib/utils";

function todayISO() {
  return toISODate(new Date());
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISODate(dt);
}

const MODULES: DayBookModule[] = ["sales", "payments", "expenses", "purchases", "stitching", "customers", "attendance", "payroll", "other"];

export default function DayBookPage() {
  const { data: user } = useCurrentUser();
  const [date, setDate] = useState(todayISO());
  const [moduleFilter, setModuleFilter] = useState<DayBookModule | "all">("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const canView = !!user?.perms.viewReports;
  const { data, isLoading, isError, error } = useDayBook(date);

  const entries = useMemo(() => data?.entries || [], [data]);

  const distinctUsers = useMemo(() => {
    const set = new Set(entries.map((e) => e.user).filter((u) => u && u !== "—"));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = minAmount ? parseFloat(minAmount) : null;
    const max = maxAmount ? parseFloat(maxAmount) : null;
    let rows = entries;
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
  }, [entries, moduleFilter, userFilter, sortOrder, search, minAmount, maxAmount]);

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
        { name: "Profit", value: data.totals.profit, color: data.totals.profit >= 0 ? "#059669" : "#ef4444" },
      ]
    : [];

  if (!canView) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={CalendarDays} title="No access" description="The Day Book is restricted to users who can view reports." />
      </div>
    );
  }

  const exportRows = filtered.map((e) => ({
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
          <Button variant="outline" size="sm" onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="Previous day">
            <ChevronLeft className="size-4" />
          </Button>
          <DatePicker value={date} onChange={setDate} className="w-40" />
          <Button variant="outline" size="sm" onClick={() => setDate((d) => shiftDate(d, 1))} aria-label="Next day">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDate(todayISO())}>
            Today
          </Button>
          <ExportMenu rows={exportRows} filename={`day-book-${date}`} sheetName="Day Book" disabled={filtered.length === 0} />
        </div>
      }
    >
      <p className="text-sm font-medium text-muted-foreground print:block hidden">{fmtDate(date)}</p>

      {isLoading && <Skeleton className="h-96 w-full" />}

      {isError && (
        <EmptyState icon={CalendarDays} title="Couldn't load the Day Book" description={error instanceof Error ? error.message : "Try again."} />
      )}

      {data && (
        <>
          {/* Financial KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Sales" value={inr(data.totals.sales)} icon={Receipt} tone="default" />
            <StatCard label="Payments Received" value={inr(data.totals.payments)} icon={Banknote} tone="success" />
            <StatCard label="Purchases" value={inr(data.totals.purchases)} icon={ShoppingCart} tone="default" />
            <StatCard label="Expenses" value={inr(data.totals.expenses)} icon={Wallet} tone="danger" />
            <StatCard label="Refunds" value={inr(data.totals.refunds)} icon={RotateCcw} tone="warning" />
            <StatCard label="Profit" value={inr(data.totals.profit)} icon={data.totals.profit >= 0 ? TrendingUp : TrendingDown} tone={data.totals.profit >= 0 ? "success" : "danger"} />
          </div>

          {/* Operational KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Invoices Created" value={data.totals.invoicesCreated} icon={FileText} />
            <StatCard label="Orders Created" value={data.totals.ordersCreated} icon={Receipt} />
            <StatCard label="Customers Added" value={data.totals.customersAdded} icon={Users} />
            <StatCard label="Attendance Events" value={data.totals.attendanceEvents} icon={Clock} />
            <StatCard label="Total Activities" value={data.totals.totalActivities} icon={ActivityIcon} />
          </div>

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
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
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
                    <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportCard>
          </div>

          {/* Filters */}
          <ReportCard className="flex flex-wrap items-center gap-2 p-3 print:hidden">
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
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Time</Th>
                  <Th>Module</Th>
                  <Th>Activity</Th>
                  <Th>Details</Th>
                  <Th align="right">Amount</Th>
                  <Th>User</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((e) => {
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
          )}
        </>
      )}
    </ReportShell>
  );
}
