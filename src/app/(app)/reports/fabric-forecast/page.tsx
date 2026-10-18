"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { ReportShell } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useRawMaterialMoves } from "@/hooks/use-inventory-ledger";
import { useAiOn, useVendorMessage } from "@/hooks/use-ai";
import { forecastMaterials } from "@/lib/fabric-forecast";
import { upcomingFestival } from "@/lib/festivals";
import { istDateString } from "@/lib/ist-date";
import { inr } from "@/lib/format";

export default function FabricForecastPage() {
  const { data: materials, isLoading: loadingMaterials } = useRawMaterials();
  const { data: moves, isLoading: loadingMoves } = useRawMaterialMoves();
  const aiOn = useAiOn("forecast");
  const vendor = useVendorMessage();
  const [message, setMessage] = useState("");
  const today = istDateString();
  const festival = upcomingFestival(today, 60);
  const rows = useMemo(
    () => forecastMaterials((materials || []).map((m) => ({ id: m.id, name: m.name, unit: m.unitName, stock: m.stockQty, costPerUnit: m.costPerUnit, lowStockAlert: m.lowStockAlert })), moves || [], today),
    [materials, moves, today]
  );
  const toBuy = rows.filter((r) => r.suggested > 0);
  const totalCost = toBuy.reduce((s, r) => s + r.estCost, 0);

  if (loadingMaterials || loadingMoves) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Fabric Demand Forecast"
      description="What raw material you are likely to need over the next 45 days, from the same weeks last year and your recent pace, compared with what is on the shelf."
      actions={
        <ReportActionsMenu
          rows={toBuy.map((r) => ({ Material: r.name, Unit: r.unit, "In stock": r.stock, "Used same weeks last year": r.usedLastYear, "Bought same weeks last year": r.boughtLastYear, "Expected need": r.need, "Suggested order": r.suggested, "Approx. cost": r.estCost }))}
          filename="fabric-forecast"
          title="Fabric Demand Forecast"
          hideWhatsApp
        />
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="Not enough history yet" description="This needs raw-material purchases or usage recorded in Inventory — last year's and recent months' movements — to forecast from." />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {festival ? `${festival.name} is ${festival.daysAway === 0 ? "today" : `in ${festival.daysAway} days`}. ` : ""}
            {toBuy.length} {toBuy.length === 1 ? "material" : "materials"} to top up, about <span className="font-semibold text-foreground">{inr(totalCost)}</span>.
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((r) => (
              <li key={r.id} className="space-y-1 rounded-xl border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-semibold">{r.name}</p>
                  <p className={r.suggested > 0 ? "shrink-0 font-semibold text-amber-700 dark:text-amber-300" : "shrink-0 text-emerald-700 dark:text-emerald-300"}>{r.suggested > 0 ? `Order ${r.suggested} ${r.unit}` : "Enough stock"}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  In stock {r.stock} {r.unit} · expected need {r.need} {r.unit}
                </p>
                <p className="text-xs text-muted-foreground">
                  Same weeks last year: used {r.usedLastYear}, bought {r.boughtLastYear} · recent pace {r.recentPace}
                </p>
                {r.suggested > 0 && <p className="text-xs">About {inr(r.estCost)}</p>}
              </li>
            ))}
          </ul>
          {aiOn && toBuy.length > 0 && (
            <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-500/30 dark:bg-violet-500/5">
              <Button
                type="button"
                variant="outline"
                className="h-11 bg-card"
                disabled={vendor.isPending}
                onClick={() => vendor.mutate({ festival: festival?.name ?? null, items: toBuy.slice(0, 30).map((r) => ({ name: r.name, qty: r.suggested, unit: r.unit })) }, { onSuccess: (r) => setMessage(r.text), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't write it") })}
              >
                {vendor.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-violet-600" />} Write a message to the vendor
              </Button>
              {message && (
                <>
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} className="w-full rounded-lg border bg-card p-2 text-sm" aria-label="Message to the vendor" />
                  <Button type="button" variant="outline" className="h-11" onClick={() => navigator.clipboard?.writeText(message).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"))}>
                    <Copy className="size-4" /> Copy
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </ReportShell>
  );
}
