"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PackageCheck, PackageX } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useTailorName } from "@/hooks/use-employees";
import { ReportShell } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StageBadge } from "@/components/orders/stage-badge";
import { buildMaterialAvailability, type AvailabilityRow } from "@/lib/order-materials";
import { orderTailorLabel } from "@/lib/order-tailor";
import { fmtDate } from "@/lib/format";
import { istDateString } from "@/lib/ist-date";
import { cn } from "@/lib/utils";

function groupByTailor(rows: AvailabilityRow[]): [string, AvailabilityRow[]][] {
  const map = new Map<string, AvailabilityRow[]>();
  for (const r of rows) map.set(r.tailor, [...(map.get(r.tailor) ?? []), r]);
  return [...map.entries()].sort(([a], [b]) => (a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b)));
}

function OrderLine({ row, today, showWait }: { row: AvailabilityRow; today: string; showWait?: boolean }) {
  const { order } = row;
  const overdue = !!order.deliveryDate && order.deliveryDate < today;
  return (
    <Link href={`/orders/${order.id}`} className="flex items-start justify-between gap-3 border-t px-3 py-2.5 text-sm first:border-t-0 active:bg-muted/50">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="whitespace-nowrap font-medium">{order.id}</span>
          {order.status !== "received" && <StageBadge stage={order.status} size="sm" />}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {order.name} · {(order.garments || []).map((g) => g.type).join(", ") || "—"}
        </p>
        {row.missing && <p className="text-xs font-medium text-amber-600">Awaiting: {row.missing}</p>}
        {order.materialsNote && <p className="truncate text-xs text-muted-foreground">{order.materialsNote}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("whitespace-nowrap text-xs font-medium", overdue ? "text-red-600" : "text-muted-foreground")}>Due {order.deliveryDate ? fmtDate(order.deliveryDate) : "—"}</p>
        {showWait && <p className="whitespace-nowrap text-xs text-muted-foreground">{row.days === 0 ? "today" : `${row.days}d waiting`}</p>}
      </div>
    </Link>
  );
}

function Group({ title, tone, rows, today, showWait, emptyText }: { title: string; tone: "green" | "red" | "grey"; rows: AvailabilityRow[]; today: string; showWait?: boolean; emptyText: string }) {
  const Icon = tone === "green" ? PackageCheck : PackageX;
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className={cn("size-4", tone === "green" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-muted-foreground")} />
        <h2 className="text-sm font-semibold">
          {title} ({rows.length})
        </h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        groupByTailor(rows).map(([tailor, list]) => (
          <div key={tailor} className="border-b last:border-b-0">
            <p className="bg-muted/40 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {tailor} · {list.length}
            </p>
            {list.map((r) => (
              <OrderLine key={r.order.id} row={r} today={today} showWait={showWait} />
            ))}
          </div>
        ))
      )}
    </section>
  );
}

export default function MaterialAvailabilityPage() {
  const { orders, isLoading } = useReportsData();
  const tailorName = useTailorName();
  const today = istDateString();

  const data = useMemo(() => buildMaterialAvailability(orders, (o) => orderTailorLabel(o, (id) => tailorName(id) || id), new Date()), [orders, tailorName]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const exportRows = [
    ...data.ready.map((r) => ({ Status: "Ready to work", Tailor: r.tailor, Order: r.order.id, Customer: r.order.name, Due: r.order.deliveryDate ? fmtDate(r.order.deliveryDate) : "", Awaiting: "", "Days waiting": "" })),
    ...data.waiting.map((r) => ({ Status: "Waiting for material", Tailor: r.tailor, Order: r.order.id, Customer: r.order.name, Due: r.order.deliveryDate ? fmtDate(r.order.deliveryDate) : "", Awaiting: r.missing, "Days waiting": r.days })),
    ...data.unrecorded.map((r) => ({ Status: "Material not recorded", Tailor: r.tailor, Order: r.order.id, Customer: r.order.name, Due: r.order.deliveryDate ? fmtDate(r.order.deliveryDate) : "", Awaiting: "", "Days waiting": "" })),
  ];

  return (
    <ReportShell
      title="Raw Material & Work Available"
      description="Which orders have their raw material and can be started now, and which are still waiting"
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="material-availability"
          title="Raw Material & Work Available"
          summaryLines={[`Ready to work: ${data.ready.length}`, `Waiting for material: ${data.waiting.length}`, `Material not recorded: ${data.unrecorded.length}`]}
        />
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border bg-emerald-50 px-2 py-3 dark:bg-emerald-950/30">
          <p className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{data.ready.length}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ready to work</p>
        </div>
        <div className="rounded-xl border bg-red-50 px-2 py-3 dark:bg-red-950/30">
          <p className="text-xl font-semibold tabular-nums text-red-700 dark:text-red-400">{data.waiting.length}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Waiting</p>
        </div>
        <div className="rounded-xl border px-2 py-3">
          <p className="text-xl font-semibold tabular-nums">{data.unrecorded.length}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Not recorded</p>
        </div>
      </div>

      {data.ready.length + data.waiting.length + data.unrecorded.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nothing to show" description="No orders are waiting to be started. Tick raw material on an order to see it here." />
      ) : (
        <div className="space-y-4">
          <Group title="Ready to work — material in" tone="green" rows={data.ready} today={today} emptyText="No order has its material in and is waiting to be started." />
          <Group title="Waiting for material" tone="red" rows={data.waiting} today={today} showWait emptyText="Nothing is waiting for material." />
          <Group title="Material not recorded" tone="grey" rows={data.unrecorded} today={today} emptyText="Every new order has its material recorded." />
        </div>
      )}
    </ReportShell>
  );
}
