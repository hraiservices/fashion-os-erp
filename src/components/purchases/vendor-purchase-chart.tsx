"use client";

import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip, CartesianGrid } from "recharts";
import { inr } from "@/lib/format";
import { LiteChartGate } from "@/components/ui/lite-chart-gate";

export interface MonthPurchase {
  label: string;
  total: number;
}

/** Buckets a vendor's purchase-order + bill totals by month for the last 6 months (oldest
 *  first), mirroring `buildCustomerSpendByMonth` on the CRM side — a single bar series, no new
 *  chart infrastructure. */
export function buildVendorPurchasesByMonth(orders: { date: string; total: number }[], bills: { billDate: string; total: number }[]): MonthPurchase[] {
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
  for (const o of orders) add(o.date, o.total);
  for (const b of bills) add(b.billDate, b.total);
  return months.map(({ label, total }) => ({ label, total }));
}

export function VendorPurchaseChart({ data }: { data: MonthPurchase[] }) {
  if (data.every((m) => m.total === 0)) return null;
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="mb-2 text-sm font-semibold">Purchases — last 6 months</h2>
      <div className="h-40">
        <LiteChartGate>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip
                formatter={(v) => [inr(Number(v)), "Purchases"]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
              />
              <Bar dataKey="total" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </LiteChartGate>
      </div>
    </div>
  );
}
