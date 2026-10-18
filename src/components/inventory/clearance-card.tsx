"use client";

import { toast } from "sonner";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiOn, useClearanceIdeas, type ClearanceItem } from "@/hooks/use-ai";

/** AI ideas for stock that has sat 60+ days: bundles, using it in orders, small offers. Suggestions only — nothing changes in inventory. */
export function ClearanceCard({ items }: { items: ClearanceItem[] }) {
  const on = useAiOn("deadstock");
  const ideas = useClearanceIdeas();
  if (!on || items.length === 0) return null;
  return (
    <section className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-500/30 dark:bg-violet-500/5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 dark:text-violet-300">
          <Sparkles className="size-4" /> Ideas to clear {items.length} slow {items.length === 1 ? "item" : "items"}
        </h2>
        <Button type="button" variant="outline" className="h-11 bg-card" disabled={ideas.isPending} onClick={() => ideas.mutate(items, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't get ideas") })}>
          {ideas.isPending && <Loader2 className="size-4 animate-spin" />} {ideas.data ? "Refresh" : "Suggest ideas"}
        </Button>
      </div>
      {ideas.data && (
        <ul className="space-y-2">
          {ideas.data.ideas.length === 0 && <li className="text-sm text-muted-foreground">No ideas came back — try again.</li>}
          {ideas.data.ideas.map((i, k) => (
            <li key={k} className="space-y-1.5 rounded-lg bg-card p-3 text-sm">
              <p className="font-medium">{i.items.join(", ") || "Stock"}</p>
              <p>{i.idea}</p>
              {i.discountPercent > 0 && <p className="text-xs text-muted-foreground">Suggested discount: up to {i.discountPercent}%</p>}
              {i.message && (
                <>
                  <p className="rounded-md bg-muted/60 p-2 text-xs">{i.message}</p>
                  <Button type="button" variant="outline" className="h-11" onClick={() => navigator.clipboard?.writeText(i.message).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"))}>
                    <Copy className="size-4" /> Copy offer
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
