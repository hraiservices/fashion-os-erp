"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEAD_STAGES, LOST_REASONS, stageLabel, type StageLabelOverrides } from "@/lib/lead-stages";
import type { LeadDto } from "@/lib/targets-types";
import { useCreateTask, usePatchLead, useTargetsMeta } from "@/hooks/use-targets";
import { useAiOn, useLeadAi, type LostReasonSuggestion } from "@/hooks/use-ai";
import { Loader2, Sparkles } from "lucide-react";
import { addDaysIso } from "@/lib/work-tasks";
import { STAGE_STYLE } from "@/components/targets/shared";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

/**
 * Move a lead to another stage. Big buttons, one tap. Picking Lost asks for a reason (quick
 * chips); picking Won lets you confirm the amount. `initialStage` lets the desktop board open
 * this already pointing at Won/Lost after a drag.
 */
export function StageSheet({
  lead,
  open,
  onOpenChange,
  labels,
  initialStage,
}: {
  lead: LeadDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels?: StageLabelOverrides;
  initialStage?: string | null;
}) {
  const patch = usePatchLead();
  const createTask = useCreateTask();
  const suggestOn = useAiOn("lostreason");
  const suggest = useLeadAi<LostReasonSuggestion>(lead?.id ?? "");
  const [suggestWhy, setSuggestWhy] = useState("");
  const today = useTargetsMeta().data?.today ?? "";
  // On by default: most lost leads are "not now", and a reminder in a month is how they come back.
  const [reconsider, setReconsider] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [wonValue, setWonValue] = useState("");

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset each time the sheet opens
      setPending(initialStage === "won" || initialStage === "lost" ? initialStage : null);
      setReason("");
      setSuggestWhy("");
      setReconsider(true);
      setWonValue(lead?.expectedValue ? String(lead.expectedValue) : "");
    }
  }, [open, initialStage, lead?.id, lead?.expectedValue]);

  if (!lead) return null;

  function move(stage: string, extra?: { lostReason?: string; wonValue?: number }) {
    patch.mutate(
      { id: lead!.id, stage, ...extra },
      {
        onSuccess: () => {
          toast.success(stage === "won" ? "Marked as won 🎉" : stage === "lost" ? "Marked as lost" : `Moved to ${stageLabel(stage, labels)}`);
          if (stage === "lost" && reconsider && today) {
            createTask.mutate(
              { title: `Reconsider ${lead!.name}`, description: extra?.lostReason ? `Marked lost: ${extra.lostReason}` : "", dueDate: addDaysIso(today, 30), reminder: "on_due", linkType: "lead", linkId: lead!.id },
              { onError: () => toast.info("Marked lost, but the 30-day reminder couldn't be set") }
            );
          }
          onOpenChange(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't move the lead"),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move {lead.name}</DialogTitle>
          <DialogDescription>Now: {stageLabel(lead.stage, labels)}</DialogDescription>
        </DialogHeader>

        {!pending && (
          <div className="grid grid-cols-2 gap-2.5 px-4 pb-6">
            {LEAD_STAGES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={patch.isPending || s === lead.stage}
                onClick={() => (s === "won" || s === "lost" ? setPending(s) : move(s))}
                className={cn("min-h-14 rounded-xl border-2 px-3 text-base font-semibold transition-transform active:scale-[0.98] disabled:opacity-40", STAGE_STYLE[s], s === lead.stage ? "border-foreground/40" : "border-transparent")}
              >
                {stageLabel(s, labels)}
              </button>
            ))}
          </div>
        )}

        {pending === "lost" && (
          <div className="space-y-3 px-4 pb-6">
            <p className="text-sm font-medium">Why was it lost?</p>
            <div className="flex flex-wrap gap-2">
              {LOST_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className={cn("min-h-11 rounded-full border px-4 text-sm font-medium", reason === r ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-card")}>
                  {r}
                </button>
              ))}
            </div>
            {suggestOn && (
              <div className="space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 text-violet-700 dark:text-violet-300"
                  disabled={suggest.isPending}
                  onClick={() =>
                    suggest.mutate(
                      { action: "lostreason" },
                      {
                        onSuccess: (r) => {
                          if (r.reason) setReason(r.reason);
                          setSuggestWhy(r.reason ? r.why : "Nothing in the history says why — pick one yourself.");
                        },
                        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't suggest a reason"),
                      }
                    )
                  }
                >
                  {suggest.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Suggest a reason
                </Button>
                {suggestWhy && <p className="text-xs text-muted-foreground">{suggestWhy}</p>}
              </div>
            )}
            <Input placeholder="Or type a reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-12" maxLength={200} />
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={reconsider} onChange={(e) => setReconsider(e.target.checked)} className="size-4 accent-primary" />
              Remind me to reconsider in 30 days
            </label>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="h-12 flex-1" onClick={() => setPending(null)}>
                Back
              </Button>
              <Button className="h-12 flex-1" variant="destructive" disabled={!reason.trim() || patch.isPending} onClick={() => move("lost", { lostReason: reason.trim() })}>
                Mark as lost
              </Button>
            </div>
          </div>
        )}

        {pending === "won" && (
          <div className="space-y-3 px-4 pb-6">
            <p className="text-sm font-medium">
              What did they buy for? <span className="font-normal text-muted-foreground">(expected {inr(lead.expectedValue)})</span>
            </p>
            <Input type="number" inputMode="decimal" min={0} placeholder="Amount ₹" value={wonValue} onChange={(e) => setWonValue(e.target.value)} className="h-12 text-lg" />
            <p className="text-xs text-muted-foreground">This is kept as the lead&apos;s &quot;Won value&quot;. Your ₹ targets count the real order or invoice, so create it from the lead afterwards.</p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="h-12 flex-1" onClick={() => setPending(null)}>
                Back
              </Button>
              <Button className="h-12 flex-1" disabled={patch.isPending} onClick={() => move("won", { wonValue: parseFloat(wonValue) || undefined })}>
                Mark as won
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
