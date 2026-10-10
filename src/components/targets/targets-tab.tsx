"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { inr } from "@/lib/format";
import { monthRange } from "@/lib/targets";
import { useTargets, useTargetsReport, type TargetsMeta } from "@/hooks/use-targets";
import { useStaffLookup } from "@/components/targets/shared";
import { TargetCard } from "@/components/targets/target-card";
import { cn } from "@/lib/utils";

/** Targets: your goals as sentences with progress bars. Managers also get the month's scoreboard below. */
export function TargetsTab({ meta }: { meta: TargetsMeta | undefined }) {
  const [view, setView] = useState<"active" | "past">("active");
  const { nameOf } = useStaffLookup(meta);
  const q = useTargets(view);
  const targets = q.data ?? [];
  const showBoard = !!meta?.can.viewAll && meta.can.viewReports;
  const range = meta ? monthRange(meta.today) : undefined;
  // Only asked for when this person may see it — otherwise it is a refused request (retried) on every visit.
  const board = useTargetsReport("leaderboard", range ? { from: range.start, to: range.end } : undefined, showBoard);
  const rows = (showBoard ? board.data?.rows : []) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["active", "past"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={cn("min-h-11 rounded-full border px-4 text-sm font-medium", view === v ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card")}>
            {v === "active" ? "Active" : "Past"}
          </button>
        ))}
        {meta?.can.manageTargets && (
          <Button className="ml-auto h-11" nativeButton={false} render={<Link href="/targets/new" />}>
            <Plus className="size-4" /> New target
          </Button>
        )}
      </div>

      {q.isLoading && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!q.isLoading && targets.length === 0 && (
        <EmptyState
          title={view === "active" ? "No active targets" : "No past targets"}
          description={meta?.can.manageTargets && view === "active" ? "Set a goal for a person or the whole shop — progress counts itself from real orders and invoices." : undefined}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {targets.map((t) => (
          <TargetCard key={t.id} target={t} nameOf={nameOf} />
        ))}
      </div>

      {showBoard && rows.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">Scoreboard · this month</h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            {rows.map((r, i) => (
              <div key={r.personId ?? `n${i}`} className="flex min-h-14 items-center gap-3 border-b px-4 py-2 last:border-b-0">
                <span className="w-5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.sales} sales · {r.leadsWon} leads won
                  </p>
                </div>
                <span className="text-base font-semibold tabular-nums">{inr(r.value)}</span>
              </div>
            ))}
          </div>
          <Link href="/reports/sales-leaderboard" className="block px-1 text-sm font-medium text-primary">
            Full report →
          </Link>
        </section>
      )}
    </div>
  );
}
