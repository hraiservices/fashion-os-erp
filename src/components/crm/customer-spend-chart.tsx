"use client";

import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip, CartesianGrid } from "recharts";
import { inr } from "@/lib/format";

export interface MonthSpend {
  label: string;
  total: number;
}

/** Buckets a customer's stitching-order + invoice totals by month for the last 6 months
 *  (oldest first), Zoho-overview style — a single bar series, no new chart infrastructure. */
export function buildCustomerSpendByMonth(orders: { inDate: string; total: number }[], invoices: { invoiceDate: string; total: number }[]): MonthSpend[] {
  const months: { key: string; label: string; total: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-IN", { month: "short" }), total: 0 });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));
  function add(dateStr: string, total: number) {
    const d = new Date(dateStr);
    const m = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (m) m.total += total;
  }
  for (const o of orders) add(o.inDate, o.total);
  for (const i of invoices) add(i.invoiceDate, i.total);
  return months.map(({ label, total }) => ({ label, total }));
}

export function CustomerSpendChart({ data }: { data: MonthSpend[] }) {
  if (data.every((m) => m.total === 0)) return null;
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="mb-2 text-sm font-semibold">Spend — last 6 months</h2>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip
              formatter={(v) => [inr(Number(v)), "Spend"]}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
            />
            <Bar dataKey="total" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
