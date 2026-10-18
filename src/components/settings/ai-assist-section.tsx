"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { useAiConfig, useSaveAiConfig } from "@/hooks/use-ai";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { AI_FEATURES, type AiAssistConfig, type AiFeature } from "@/lib/ai-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** The master switch, per-feature switches and daily cap for the AI helpers on leads, tasks and targets. */
export function AiAssistSection() {
  const { data, isLoading } = useAiConfig();
  const save = useSaveAiConfig();
  const [draft, setDraft] = useState<AiAssistConfig | null>(null);

  useSyncFromSource(data, (v) => {
    if (v && !draft) setDraft(v.config);
  });

  if (isLoading || !draft || !data) return <Skeleton className="h-64 w-full" />;
  const cfg = draft;

  async function onSave() {
    try {
      await save.mutateAsync(cfg);
      toast.success("AI helper settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" /> AI Helpers
        </CardTitle>
        <CardDescription>
          Lead briefs, WhatsApp reply drafts, photo and voice-note reading, smart quotes, task creation, daily plan and weekly insights. Staff always get suggestions to review — nothing is sent or saved without them. Every request uses your Gemini quota, so you control it here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data.keyConfigured && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">No Gemini key found yet. Add one under Settings → AI Copilot, then come back.</p>}
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="size-5 accent-primary" checked={cfg.enabled} onChange={(e) => setDraft({ ...cfg, enabled: e.target.checked })} />
          Turn AI helpers on for the shop
        </label>
        <div className={cfg.enabled ? "space-y-1" : "pointer-events-none space-y-1 opacity-50"}>
          {(Object.keys(AI_FEATURES) as AiFeature[]).map((f) => (
            <label key={f} className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={cfg.features[f] !== false} onChange={(e) => setDraft({ ...cfg, features: { ...cfg.features, [f]: e.target.checked } })} />
              {AI_FEATURES[f]}
            </label>
          ))}
        </div>
        <div className="max-w-xs space-y-1">
          <Label className="text-xs">Most AI requests per day (whole shop)</Label>
          <Input type="number" inputMode="numeric" min={1} max={5000} value={cfg.dailyCap} onChange={(e) => setDraft({ ...cfg, dailyCap: Math.max(1, Math.min(5000, parseInt(e.target.value, 10) || 1)) })} className="h-11" />
          <p className="text-xs text-muted-foreground">Used today: {data.used} of {cfg.dailyCap}</p>
        </div>
        <Button className="h-12 px-6 text-base sm:h-9 sm:px-4 sm:text-sm" disabled={save.isPending} onClick={onSave}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>

        {data.usage && (
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Usage report</h3>
            {data.usage.byDay.length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI requests yet.</p>
            ) : (
              <>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Requests per day (last {data.usage.byDay.length} days)</p>
                  <div className="flex h-16 items-end gap-0.5" role="img" aria-label="Requests per day">
                    {data.usage.byDay.map((d) => {
                      const max = Math.max(...data.usage!.byDay.map((x) => x.count), 1);
                      return <div key={d.date} title={`${d.date}: ${d.count}`} className="flex-1 rounded-sm bg-primary/70" style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }} />;
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">By feature, last 7 days</p>
                  <ul className="space-y-0.5 text-sm">
                    {Object.entries(data.usage.byFeature)
                      .sort((a, b) => b[1] - a[1])
                      .map(([f, n]) => (
                        <li key={f} className="flex justify-between gap-2">
                          <span>{AI_FEATURES[f as AiFeature] ?? f}</span>
                          <span className="tabular-nums text-muted-foreground">{n}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                {data.usage.byUser.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Busiest users</p>
                    <ul className="space-y-0.5 text-sm">
                      {data.usage.byUser.map((u) => (
                        <li key={u.email} className="flex justify-between gap-2">
                          <span className="min-w-0 truncate">{u.email}</span>
                          <span className="tabular-nums text-muted-foreground">{u.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
