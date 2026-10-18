"use client";

import { toast } from "sonner";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { ReportShell } from "@/components/reports/report-shell";
import { Button } from "@/components/ui/button";
import { useAiOn, useSocialPlan } from "@/hooks/use-ai";

const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"));

export default function SocialPlannerPage() {
  const on = useAiOn("social");
  const plan = useSocialPlan();
  const d = plan.data;
  return (
    <ReportShell title="Instagram Planner" description="A week of posts and three reel scripts, based on what has actually been selling. Take your own photos; the AI writes the words.">
      {!on ? (
        <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">This helper is switched off. An admin can turn on &quot;Instagram posts and reel scripts&quot; in Settings → AI Helpers.</p>
      ) : (
        <div className="space-y-4">
          <Button className="h-12 w-full sm:w-auto" disabled={plan.isPending} onClick={() => plan.mutate(undefined, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't make the plan") })}>
            {plan.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {d ? "Make a new plan" : "Plan my week"}
          </Button>
          {d && (
            <>
              <p className="text-xs text-muted-foreground">
                Based on {d.basedOn.orders} orders in the last 90 days{d.basedOn.topGarments.length ? `, mostly ${d.basedOn.topGarments.map((g) => g.type).join(", ")}` : ""}
                {d.basedOn.festival ? `, and ${d.basedOn.festival} coming up` : ""}.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {d.posts.map((p, i) => (
                  <div key={i} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {p.day} · {p.kind}
                      </span>
                      <Button type="button" variant="outline" size="sm" className="h-11" onClick={() => copy(`${p.caption}\n\n${p.hashtags.join(" ")}`)}>
                        <Copy className="size-4" /> Copy
                      </Button>
                    </div>
                    <p className="text-muted-foreground">Photo idea: {p.idea}</p>
                    <p>{p.caption}</p>
                    <p className="text-xs text-primary">{p.hashtags.join(" ")}</p>
                  </div>
                ))}
              </div>
              {d.reels.length > 0 && <h2 className="pt-2 text-sm font-semibold">Reel scripts</h2>}
              <div className="grid gap-3 md:grid-cols-3">
                {d.reels.map((r, i) => (
                  <div key={i} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
                    <p className="font-semibold">{r.title}</p>
                    <p>
                      <span className="text-muted-foreground">Hook: </span>
                      {r.hook}
                    </p>
                    <ol className="list-decimal space-y-0.5 pl-5">
                      {r.scenes.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ol>
                    <Button type="button" variant="outline" className="h-11 w-full" onClick={() => copy(`${r.title}\nHook: ${r.hook}\n${r.scenes.map((s, j) => `${j + 1}. ${s}`).join("\n")}\n\n${r.caption}`)}>
                      <Copy className="size-4" /> Copy script
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">AI-written from your sales numbers — check each caption before posting.</p>
            </>
          )}
        </div>
      )}
    </ReportShell>
  );
}
