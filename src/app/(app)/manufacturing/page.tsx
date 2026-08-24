"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Factory, ChevronRight } from "lucide-react";
import { useWorkOrders } from "@/hooks/use-work-orders";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTailorName } from "@/hooks/use-employees";
import { fmtDate } from "@/lib/format";
import { WO_STATUS_LABELS, type WoStatus } from "@/lib/manufacturing";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

const FILTERS: { value: WoStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In progress" },
  { value: "qc", label: "QC" },
  { value: "completed", label: "Completed" },
];

const STATUS_BADGE_VARIANT: Record<WoStatus, "outline" | "secondary"> = {
  draft: "outline",
  in_progress: "outline",
  qc: "outline",
  completed: "secondary",
};

export default function ManufacturingPage() {
  const { data: orders, isLoading } = useWorkOrders();
  const { data: user } = useCurrentUser();
  const tailorName = useTailorName();
  const canManage = !!user?.perms.manageManufacturing;

  const [filter, setFilter] = useState<WoStatus | "all">("all");

  const filtered = useMemo(() => (orders || []).filter((o) => filter === "all" || o.status === filter), [orders, filter]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Manufacturing"
        description={`${filtered.length} of ${orders?.length ?? 0} work orders`}
        actions={
          canManage && (
            <Button nativeButton={false} render={<Link href="/manufacturing/new" />}>
              <Plus className="size-4" /> New work order
            </Button>
          )
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
              filter === f.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="No work orders yet"
          description="Create a work order to convert raw materials into finished-goods stock via your tailors."
          action={
            canManage && (
              <Button nativeButton={false} render={<Link href="/manufacturing/new" />}>
                <Plus className="size-4" /> New work order
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Link key={o.id} href={`/manufacturing/${o.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{o.woNumber}</span>
                  <Badge variant={STATUS_BADGE_VARIANT[o.status]}>{WO_STATUS_LABELS[o.status]}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {o.qtyToProduce}x {o.productName} · {o.tailor ? tailorName(o.tailor) : "Unassigned"} · {fmtDate(o.startDate)}
                </p>
              </div>
              {o.costPerUnit != null && <span className="shrink-0 text-xs text-muted-foreground">₹{o.costPerUnit}/unit</span>}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
