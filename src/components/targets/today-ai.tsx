"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Loader2, MessageCircle, PartyPopper, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAiOn, useDailyPlan, useInsights, useNudge, useOrderRisks, type PlanItem } from "@/hooks/use-ai";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { fmtDate, inr } from "@/lib/format";
import { leadHeat } from "@/lib/lead-insights";
import type { LeadDto } from "@/lib/targets-types";
import { cn } from "@/lib/utils";

/** Orders likely to miss their delivery date — plain rules, so it works with AI off. */
export function OrderRiskCard({ today }: { today: string }) {
  const { data: risks = [] } = useOrderRisks(today, true);
  const [open, setOpen] = useState(false);
  if (risks.length === 0) return null;
  const shown = open ? risks : risks.slice(0, 3);
  return (
    <section className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-500/30 dark:bg-red-500/5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300">
        <AlertTriangle className="size-4" /> {risks.length} {risks.length === 1 ? "order" : "orders"} may miss the delivery date
      </h2>
      <ul className="space-y-1">
        {shown.map((r) => (
          <li key={r.id}>
            <Link href={`/orders/${r.id}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-card px-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{r.name}</span> <span className="text-muted-foreground">· {r.status}</span>
              </span>
              <span className={cn("shrink-0 text-xs font-medium", r.level === "late" ? "text-red-600" : "text-amber-700 dark:text-amber-300")}>
                {r.level === "late" ? `${-r.daysLeft}d late` : `${r.daysLeft}d left, needs ~${r.needed}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {risks.length > 3 && (
        <button type="button" onClick={() => setOpen(!open)} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
          {open ? "Show fewer" : `Show all ${risks.length}`} <ChevronDown className={cn("size-4", open && "rotate-180")} />
        </button>
      )}
    </section>
  );
}

const WHY = { due: "follow-up due", quiet: "gone quiet", hot: "hot lead" } as const;

/** One tap: AI orders today's leads and at-risk orders into a short plan. */
export function DailyPlanCard({ today, buckets }: { today: string; buckets: { due: LeadDto[]; quiet: LeadDto[]; hot: LeadDto[] } }) {
  const on = useAiOn("plan");
  const plan = useDailyPlan();
  const { data: risks = [] } = useOrderRisks(today, on);
  if (!on) return null;

  function run() {
    const items: PlanItem[] = (["due", "quiet", "hot"] as const).flatMap((k) =>
      buckets[k].slice(0, 12).map((l) => ({ name: l.name, why: WHY[k], stage: l.stage, heat: leadHeat(l, today) ?? "none", value: l.expectedValue }))
    );
    plan.mutate({ items, risks: risks.slice(0, 8).map((r) => `${r.name}: ${r.level === "late" ? `${-r.daysLeft} days late` : `${r.daysLeft} days left`}, at ${r.status}`) }, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't make the plan") });
  }

  return (
    <section className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-500/30 dark:bg-violet-500/5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 dark:text-violet-300">
          <Sparkles className="size-4" /> Today&apos;s plan
        </h2>
        <Button type="button" variant="outline" className="h-11 bg-card" disabled={plan.isPending} onClick={run}>
          {plan.isPending && <Loader2 className="size-4 animate-spin" />} {plan.data ? "Plan again" : "Plan my day"}
        </Button>
      </div>
      {plan.data && (
        <ol className="list-decimal space-y-1.5 rounded-lg bg-card py-3 pl-8 pr-3 text-sm">
          {plan.data.plan.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Before a festival: past customers worth a message, with a ready message. Works without AI (plain wording). */
export function FestivalNudgeCard({ canEdit }: { canEdit: boolean }) {
  const { data } = useNudge(canEdit);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!canEdit || !data?.festival || data.customers.length === 0) return null;
  const text = message ?? data.message;
  const fill = (name: string) => text.replaceAll("{name}", name.trim().split(/\s+/)[0] || "there");

  return (
    <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
      <button type="button" onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
          <PartyPopper className="size-4 shrink-0" /> {data.festival.name} is {data.festival.daysAway === 0 ? "today" : data.festival.daysAway === 1 ? "tomorrow" : `in ${data.festival.daysAway} days`} — {data.customers.length} past customers to reconnect
        </span>
        <ChevronDown className={cn("size-4 shrink-0", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setMessage(e.target.value)} rows={3} className="bg-card text-base" aria-label="Message to send" />
          <p className="text-xs text-muted-foreground">{data.aiDrafted ? "Written by AI — " : ""}{"{name}"} becomes each customer&apos;s first name. Edit freely.</p>
          <ul className="space-y-1">
            {data.customers.map((c) => (
              <li key={c.mobile} className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">Last order {fmtDate(c.lastOrder)} · spent {inr(c.spent)}</span>
                </span>
                <a href={`https://wa.me/91${normalizeIndianMobile(c.mobile)}?text=${encodeURIComponent(fill(c.name))}`} target="_blank" rel="noopener noreferrer" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white" aria-label={`WhatsApp ${c.name}`}>
                  <MessageCircle className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Managers: a plain-language read of the lead numbers plus a coaching tip per salesperson. */
export function InsightsCard({ range }: { range?: { from: string; to: string } }) {
  const on = useAiOn("insights");
  const insights = useInsights();
  if (!on) return null;
  const d = insights.data;
  return (
    <section className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-500/30 dark:bg-violet-500/5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 dark:text-violet-300">
          <Sparkles className="size-4" /> Weekly insights
        </h2>
        <Button type="button" variant="outline" className="h-11 bg-card" disabled={insights.isPending} onClick={() => insights.mutate(range, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't make the insights") })}>
          {insights.isPending && <Loader2 className="size-4 animate-spin" />} {d ? "Refresh" : "Explain my numbers"}
        </Button>
      </div>
      {d && (
        <div className="space-y-3 rounded-lg bg-card p-3 text-sm">
          <p className="font-medium">{d.headline}</p>
          <ul className="list-disc space-y-1 pl-5">
            {d.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          {d.coaching.length > 0 && (
            <div className="space-y-1.5 border-t pt-2">
              <p className="text-xs font-semibold text-muted-foreground">Coaching</p>
              {d.coaching.map((c) => (
                <p key={c.name}>
                  <span className="font-medium">{c.name}:</span> {c.tip}
                </p>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">AI-written from your lead numbers — check against the reports before acting.</p>
        </div>
      )}
    </section>
  );
}
