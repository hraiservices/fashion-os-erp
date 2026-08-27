"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, AlertTriangle, Shirt } from "lucide-react";
import { ReportShell } from "@/components/reports/report-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TailorWorksheetSection, WorksheetGarment } from "@/lib/tailor-worksheet";

async function fetchWorksheet(): Promise<TailorWorksheetSection[]> {
  const res = await fetch("/api/reports/tailor-worksheet");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load worksheet");
  return data.sections;
}

function GarmentLine({ g }: { g: WorksheetGarment }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-sm first:border-t-0">
      <div className="min-w-0">
        <p className="font-medium">
          {g.garmentType}
          {g.lining ? <span className="text-muted-foreground"> ({g.lining})</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {g.customerName} — {g.orderId}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-medium">Qty {g.qty}</p>
        {g.deliveryDate && <p className="text-xs text-muted-foreground">Due {fmtDate(g.deliveryDate)}</p>}
      </div>
    </div>
  );
}

export default function TailorWorksheetPage() {
  const { data: sections, isLoading } = useQuery({ queryKey: ["tailor-worksheet"], queryFn: fetchWorksheet, staleTime: 30_000 });

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Daily Tailor Worksheet"
      description="Today's work and anything still pending from before, per tailor — download and print or share on WhatsApp."
    >
      <div className="flex justify-end print:hidden">
        <Button nativeButton={false} render={<a href="/api/reports/tailor-worksheet/pdf" target="_blank" rel="noopener noreferrer" />}>
          <Download className="size-4" /> Download printable PDF
        </Button>
      </div>

      {!sections || sections.length === 0 ? (
        <EmptyState icon={Shirt} title="No pending work" description="Every assigned garment is fully finished — nothing to print today." />
      ) : (
        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.tailorId} className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">{s.tailorName}</h2>
              </div>

              {s.carriedOver.length > 0 && (
                <div className="border-b border-amber-500/30 bg-amber-50 dark:bg-amber-950/30">
                  <p className="flex items-center gap-1.5 px-3 pt-2.5 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-3.5" /> Pending from before ({s.carriedOver.length})
                  </p>
                  <div className="px-3 pb-1">
                    {s.carriedOver.map((g) => (
                      <GarmentLine key={g.key} g={g} />
                    ))}
                  </div>
                </div>
              )}

              <div className={cn("px-3", s.newToday.length > 0 && "pb-1")}>
                <p className="px-0 pt-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Today's work ({s.newToday.length})</p>
                {s.newToday.length === 0 ? (
                  <p className="px-0 py-3 text-sm text-muted-foreground">No new work today.</p>
                ) : (
                  s.newToday.map((g) => <GarmentLine key={g.key} g={g} />)
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ReportShell>
  );
}
