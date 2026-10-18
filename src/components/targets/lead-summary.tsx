"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Clock, Loader2, Sparkles } from "lucide-react";
import { useAiOn, useLeadAi } from "@/hooks/use-ai";
import { leadHeat } from "@/lib/lead-insights";
import { leadOneLiner } from "@/lib/lead-oneliner";
import { isOpenStage } from "@/lib/lead-stages";
import { usualReplyWindow } from "@/lib/reply-time";
import type { LeadActivityDto, LeadDto } from "@/lib/targets-types";

/** The line under a lead's name: a plain one-liner always, a sharper AI one on tap, and when the lead usually writes back. */
export function LeadSummary({ lead, today, activities, canEdit }: { lead: LeadDto; today: string; activities: LeadActivityDto[]; canEdit: boolean }) {
  const aiOn = useAiOn("oneliner");
  const ai = useLeadAi<{ text: string }>(lead.id);
  const [aiLine, setAiLine] = useState<string | null>(null);
  const plain = leadOneLiner(lead, today, leadHeat(lead, today));
  const window = isOpenStage(lead.stage) ? usualReplyWindow(activities) : null;

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-sm">{aiLine ?? plain}</p>
      {aiOn && canEdit && (
        <button
          type="button"
          disabled={ai.isPending}
          onClick={() => ai.mutate({ action: "oneliner" }, { onSuccess: (r) => setAiLine(r.text), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't summarise") })}
          className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-violet-700 disabled:opacity-60 dark:text-violet-300"
        >
          {ai.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {aiLine ? "Summarise again" : "Summarise with AI"}
        </button>
      )}
      {window && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`Based on ${window.count} of their WhatsApp messages`}>
          <Clock className="size-3.5 shrink-0" /> Usually writes back around {window.label} — a good time to message.
        </p>
      )}
    </div>
  );
}
