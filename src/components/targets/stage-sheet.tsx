"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEAD_STAGES, LOST_REASONS, stageLabel, type StageLabelOverrides } from "@/lib/lead-stages";
import type { LeadDto } from "@/lib/targets-types";
import { usePatchLead } from "@/hooks/use-targets";
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
  const [pending, setPending] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [wonValue, setWonValue] = useState("");

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset each time the sheet opens
      setPending(initialStage === "won" || initialStage === "lost" ? initialStage : null);
      setReason("");
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
          onOpenChange(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't move the lead"),
      }
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Move {lead.name}</SheetTitle>
          <SheetDescription>Now: {stageLabel(lead.stage, labels)}</SheetDescription>
        </SheetHeader>

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
            <Input placeholder="Or type a reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-12" maxLength={200} />
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
      </SheetContent>
    </Sheet>
  );
}
