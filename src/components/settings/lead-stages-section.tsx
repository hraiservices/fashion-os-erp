"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_STAGE_LABELS, LEAD_STAGES, type LeadStage, type StageLabelOverrides } from "@/lib/lead-stages";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Rename the lead stages shown in Targets (e.g. "Visit" → "Showroom visit"). The stage keys stay
 *  fixed — they're stored on every lead and used by reports — only the words people see change.
 *  Blank = back to the default word. */
export function LeadStagesSection() {
  const qc = useQueryClient();
  const { data, isLoading, save } = useAppSetting<StageLabelOverrides>("leadStageLabels", {});
  const [draft, setDraft] = useState<Record<LeadStage, string> | null>(null);

  useSyncFromSource(data, (v) => {
    if (v && !draft) setDraft(Object.fromEntries(LEAD_STAGES.map((s) => [s, v[s] || ""])) as Record<LeadStage, string>);
  });

  if (isLoading || !draft) return <Skeleton className="h-64 w-full" />;

  async function commit(next: Record<LeadStage, string>) {
    const overrides: StageLabelOverrides = {};
    for (const s of LEAD_STAGES) {
      const label = next[s].trim();
      if (label && label !== DEFAULT_STAGE_LABELS[s]) overrides[s] = label;
    }
    try {
      await save.mutateAsync(overrides);
      qc.invalidateQueries({ queryKey: ["targets"] });
      toast.success("Stage names saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead stage names</CardTitle>
        <CardDescription>Change the words used on the Leads list and board. Reports and existing leads are not affected.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {LEAD_STAGES.map((s) => (
            <div key={s} className="space-y-1.5">
              <Label htmlFor={`stage-${s}`}>{DEFAULT_STAGE_LABELS[s]}</Label>
              <Input
                id={`stage-${s}`}
                value={draft[s]}
                maxLength={24}
                placeholder={DEFAULT_STAGE_LABELS[s]}
                onChange={(e) => setDraft({ ...draft, [s]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => commit(draft)} disabled={save.isPending}>
            Save names
          </Button>
          <Button
            variant="outline"
            disabled={save.isPending}
            onClick={() => {
              const blank = Object.fromEntries(LEAD_STAGES.map((s) => [s, ""])) as Record<LeadStage, string>;
              setDraft(blank);
              commit(blank);
            }}
          >
            <RotateCcw className="mr-1.5 size-4" /> Reset to defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
