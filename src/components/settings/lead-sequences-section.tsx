"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { cleanSequences, DEFAULT_SEQUENCES, LEAD_SEQUENCES_KEY, type LeadSequence, type StepKind } from "@/lib/lead-sequences";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const MAX_PLANS = 10;
const MAX_STEPS = 12;

/** Follow-up plans: the cadence of reminders a lead gets. Each step becomes a task on its day — staff still send every message. */
export function LeadSequencesSection() {
  const { data, isLoading, save } = useAppSetting<unknown>(LEAD_SEQUENCES_KEY, DEFAULT_SEQUENCES);
  const [draft, setDraft] = useState<LeadSequence[] | null>(null);

  useSyncFromSource(data, (v) => {
    if (v && !draft) setDraft(cleanSequences(v));
  });

  if (isLoading || !draft) return <Skeleton className="h-64 w-full" />;
  const plans = draft;

  const updatePlan = (i: number, patch: Partial<LeadSequence>) =>
    setDraft(plans.map((p, j) => (j === i ? { ...p, ...patch } : patch.autoStart ? { ...p, autoStart: false } : p)));
  const updateStep = (pi: number, si: number, patch: Partial<LeadSequence["steps"][number]>) =>
    setDraft(plans.map((p, j) => (j === pi ? { ...p, steps: p.steps.map((s, k) => (k === si ? { ...s, ...patch } : s)) } : p)));

  async function onSave() {
    const cleaned = cleanSequences(plans);
    try {
      await save.mutateAsync(cleaned);
      setDraft(cleaned);
      toast.success("Follow-up plans saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Follow-up plans</CardTitle>
        <CardDescription>
          A plan turns into dated follow-up tasks for whoever owns the lead. Nothing is sent to the customer by itself — staff open the task and send. A plan stops on its own when the lead is won or lost.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {plans.map((p, pi) => (
          <div key={p.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-xs">Plan name</Label>
                <Input value={p.name} maxLength={60} onChange={(e) => updatePlan(pi, { name: e.target.value })} className="h-11" />
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={`Remove ${p.name || "plan"}`} onClick={() => setDraft(plans.filter((_, j) => j !== pi))}>
                <Trash2 className="size-4" />
              </Button>
            </div>

            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={p.autoStart} onChange={(e) => updatePlan(pi, { autoStart: e.target.checked })} className="size-4 accent-primary" />
              Start this plan by itself on every new lead
            </label>

            <div className="space-y-2">
              <Label className="text-xs">Steps</Label>
              {p.steps.map((s, si) => (
                <div key={si} className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/40 p-2">
                  <div className="w-24 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Day</Label>
                    <Input type="number" inputMode="numeric" min={0} max={180} value={s.days} onChange={(e) => updateStep(pi, si, { days: Math.max(0, Math.min(180, Number(e.target.value) || 0)) })} className="h-11" />
                  </div>
                  <div className="w-32 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">How</Label>
                    <Select value={s.kind} onValueChange={(v) => updateStep(pi, si, { kind: (v as StepKind) ?? "whatsapp" })}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="call">Call</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">What to do</Label>
                    <Input value={s.title} maxLength={120} onChange={(e) => updateStep(pi, si, { title: e.target.value })} className="h-11" />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Remove step" onClick={() => updatePlan(pi, { steps: p.steps.filter((_, k) => k !== si) })}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={p.steps.length >= MAX_STEPS}
                onClick={() => updatePlan(pi, { steps: [...p.steps, { days: (p.steps[p.steps.length - 1]?.days ?? 0) + 3, kind: "whatsapp", title: "" }] })}
              >
                <Plus className="size-4" /> Add a step
              </Button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={plans.length >= MAX_PLANS}
            onClick={() => setDraft([...plans, { id: `plan${Date.now()}`, name: "", autoStart: false, steps: [{ days: 0, kind: "whatsapp", title: "" }] }])}
          >
            <Plus className="size-4" /> Add a plan
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => setDraft(DEFAULT_SEQUENCES)}>
            <RotateCcw className="size-4" /> Reset to defaults
          </Button>
        </div>
        <Button type="button" className="h-11" disabled={save.isPending} onClick={onSave}>
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}
