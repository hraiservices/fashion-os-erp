"use client";

import { useMemo, useState } from "react";
import { Wallet, Search } from "lucide-react";
import { useExpenses } from "@/hooks/use-expenses";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Input } from "@/components/ui/input";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

export default function ExpenseDetailsPage() {
  const { data: expenses, isLoading } = useExpenses();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const categories = useMemo(() => {
    const set = new Set((expenses || []).map((e) => e.category).filter(Boolean));
    return Array.from(set).sort();
  }, [expenses]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (expenses || [])
      .filter((e) => !q || e.category.toLowerCase().includes(q) || e.description.toLowerCase().includes(q))
      .filter((e) => category === "all" || e.category === category)
      .filter((e) => isWithinDateRange(e.date, range))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, search, category, range]);

  const total = useMemo(() => rows.reduce((s, e) => s + e.amount, 0), [rows]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Expense Details"
      description="Every expense logged, with category, method, and who recorded it."
      actions={
        rows.length > 0 && (
          <ExportMenu
            rows={rows.map((e) => ({ Date: e.date, Category: e.category, Description: e.description, Amount: e.amount, Method: e.payMethod, "Recorded By": e.createdBy || "" }))}
            filename="expense_details"
          />
        )
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Expenses" value={inr(total)} icon={Wallet} />
      </div>

      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        resultLabel={`${rows.length} expense${rows.length === 1 ? "" : "s"}`}
        category={
          <Select value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{category === "all" ? "All Categories" : category}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" enterKeyHint="search" placeholder="Search category or description…" className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No expenses yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Date</Th>
              <Th>Category</Th>
              <Th>Description</Th>
              <Th>Method</Th>
              <Th>Recorded By</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-muted/30">
                <Td className="text-muted-foreground">{fmtDate(e.date)}</Td>
                <Td className="font-medium">{e.category}</Td>
                <Td className="max-w-56 truncate text-muted-foreground">{e.description || "—"}</Td>
                <Td className="text-muted-foreground">{e.payMethod}</Td>
                <Td className="text-muted-foreground">{e.createdBy || "—"}</Td>
                <Td align="right" className="font-medium">{inr(e.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
