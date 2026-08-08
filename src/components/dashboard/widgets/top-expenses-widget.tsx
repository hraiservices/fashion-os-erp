"use client";

import Link from "next/link";
import { useExpenses } from "@/hooks/use-expenses";
import { inr, inrCompact } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const DONUT_COLORS = ["#0ea5e9", "#f97316", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

export function TopExpensesWidget() {
  const { data: expenses, isLoading } = useExpenses();
  if (isLoading) return <Skeleton className="h-72 w-full" />;

  const expList = expenses || [];
  const byCategory: Record<string, number> = {};
  expList.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  });
  const topExp = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, amount]) => ({ category, amount }));
  const totalExp = expList.reduce((s, e) => s + e.amount, 0);

  return (
    <Link href="/expenses" className="block rounded-xl border bg-card p-5 transition-colors hover:bg-muted/20">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Top Expenses</h2>
        <span className="text-xs text-muted-foreground">View all</span>
      </div>
      {topExp.length === 0 ? (
        <EmptyState icon={Wallet} title="No expenses yet" className="border-0 py-8" />
      ) : (
        <div className="flex items-center gap-4">
          <div className="h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={topExp} cx="50%" cy="50%" innerRadius={42} outerRadius={70} dataKey="amount" nameKey="category" paddingAngle={2}>
                  {topExp.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [inr(Number(v)), ""]} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2 overflow-hidden">
            {topExp.map((e, i) => (
              <div key={e.category} className="flex min-w-0 items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  <span className="truncate text-muted-foreground">{e.category}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{inrCompact(e.amount)}</span>
              </div>
            ))}
            {totalExp > 0 && (
              <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{inr(totalExp)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}
