"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeTarget, formatMetricValue, METRIC_LABELS } from "@/lib/targets";
import { fmtDateShort } from "@/lib/format";
import { useDeleteTarget, usePatchTarget, useTarget, useTargetsMeta } from "@/hooks/use-targets";
import { ProgressBar, TargetStatusChip, useStaffLookup } from "@/components/targets/shared";

export default function TargetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const meta = useTargetsMeta().data;
  const { nameOf } = useStaffLookup(meta);
  const { data: t, isLoading } = useTarget(id);
  const patch = usePatchTarget();
  const del = useDeleteTarget();
  const [confirm, setConfirm] = useState(false);

  if (isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-2xl" />;
  if (!t) return <p className="text-sm text-muted-foreground">Target not found.</p>;
  const p = t.progress;
  const { headline, detail } = describeTarget(t.metric, p);
  const expectedPct = p.target > 0 ? (p.expected / p.target) * 100 : 0;
  const canManage = !!meta?.can.manageTargets;
  const who = t.scope === "shop" ? "Whole shop" : t.assigneeIds.map(nameOf).join(", ") || "Nobody yet";
  const stat = (label: string, value: string) => (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 space-y-5 pb-8">
      <BackLink href="/targets?tab=targets">Targets</BackLink>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">{t.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {who} · {fmtDateShort(t.startDate)} – {fmtDateShort(t.endDate)}
            </p>
            <p className="text-xs text-muted-foreground">{METRIC_LABELS[t.metric]}</p>
          </div>
          <TargetStatusChip status={p.status} />
        </div>
        <p className="text-2xl font-bold">{headline}</p>
        <ProgressBar pct={p.pct} expectedPct={expectedPct} status={p.status} />
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stat("Still to go", formatMetricValue(t.metric, Math.max(0, p.remaining)))}
        {stat("Days left", String(p.daysLeft))}
        {stat("Should be at by now", formatMetricValue(t.metric, p.expected))}
        {stat("Heading for", formatMetricValue(t.metric, p.projected))}
        {p.likely > 0 && stat("Likely to close", formatMetricValue(t.metric, p.likely))}
        {p.likely > 0 && stat("Won + likely", formatMetricValue(t.metric, p.forecast))}
      </div>

      {p.byPerson.length > 0 && t.scope !== "shop" && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">Who got what</h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            {p.byPerson.map((c) => (
              <div key={c.personId ?? "none"} className="flex min-h-12 items-center justify-between border-b px-4 last:border-b-0">
                <span>{nameOf(c.personId)}</span>
                <span className="font-semibold tabular-nums">{formatMetricValue(t.metric, c.value)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(t.garmentTypes.length > 0 || t.productIds.length > 0) && (
        <p className="text-sm text-muted-foreground">
          Only counting: {[...t.garmentTypes, ...t.productIds.map((pid) => meta?.products.find((x) => x.id === pid)?.name ?? "product")].join(", ")}
        </p>
      )}
      {t.notes && <p className="whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm">{t.notes}</p>}

      {canManage && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12" nativeButton={false} render={<Link href={`/targets/${t.id}/edit`} />}>
            <Pencil className="size-4" /> Edit
          </Button>
          <Button
            variant="outline"
            className="h-12"
            disabled={patch.isPending}
            onClick={() =>
              patch.mutate(
                { id: t.id, statusOverride: t.statusOverride === "cancelled" ? null : "cancelled" },
                { onSuccess: () => toast.success(t.statusOverride === "cancelled" ? "Target restored" : "Target cancelled"), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update") }
              )
            }
          >
            {t.statusOverride === "cancelled" ? "Restore" : "Cancel target"}
          </Button>
          <Button
            variant="outline"
            className={confirm ? "col-span-2 h-12 border-red-500 text-red-600" : "col-span-2 h-12"}
            disabled={del.isPending}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              del.mutate(t.id, { onSuccess: () => { toast.success("Target deleted"); router.push("/targets?tab=targets"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't delete") });
            }}
          >
            {confirm ? "Tap again to delete for good" : "Delete"}
          </Button>
        </div>
      )}
    </div>
  );
}
