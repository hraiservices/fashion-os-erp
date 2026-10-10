"use client";

import Link from "next/link";
import { CalendarClock, MessageCircle, Phone } from "lucide-react";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StageLabelOverrides } from "@/lib/lead-stages";
import type { LeadDto } from "@/lib/targets-types";
import { dueLabel, DUE_TONE_CLASS, LikelyStar, StageChip, telHref, whatsappHref } from "@/components/targets/shared";

/**
 * One lead as a card: name, what they want, ₹, stage (tap to move it), next follow-up, and big
 * Call / WhatsApp buttons. The card body opens the lead; the stage chip and buttons don't.
 */
export function LeadCard({
  lead,
  today,
  ownerName,
  labels,
  onStageTap,
  compact,
  className,
}: {
  lead: LeadDto;
  today: string;
  ownerName?: string;
  labels?: StageLabelOverrides;
  onStageTap?: (lead: LeadDto) => void;
  /** Narrow board columns: stacked layout, icon-only Call / WhatsApp. */
  compact?: boolean;
  className?: string;
}) {
  const tel = telHref(lead.mobile);
  const wa = whatsappHref(lead.mobile, `Hello ${lead.name}, `);
  const next = lead.nextFollowUp ? dueLabel(lead.nextFollowUp.dueDate, today) : null;

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className={cn("flex gap-3 p-4 pb-3", compact ? "flex-col gap-1.5 p-3 pb-2" : "items-start")}>
        <Link href={`/targets/leads/${lead.id}`} className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-base font-semibold leading-tight">
            <span className="truncate">{lead.name}</span>
            {lead.likelyToClose && <LikelyStar on />}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {lead.productInterest || "No product noted"}
            {lead.expectedValue > 0 && <span className="font-medium text-foreground"> · {inr(lead.expectedValue)}</span>}
          </p>
          {ownerName && <p className="mt-0.5 truncate text-xs text-muted-foreground">{ownerName}</p>}
        </Link>
        <button type="button" onClick={() => onStageTap?.(lead)} disabled={!onStageTap} aria-label={`Change stage of ${lead.name}`} className={cn("shrink-0 self-start disabled:pointer-events-none", compact ? "min-h-8" : "min-h-11")}>
          <StageChip stage={lead.stage} labels={labels} />
        </button>
      </div>

      {next && (
        <p className={cn("flex items-center gap-1.5 truncate text-sm", compact ? "mx-3 mb-2 text-xs" : "mx-4 mb-3")}>
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("shrink-0", DUE_TONE_CLASS[next.tone])}>{next.text}</span>
          <span className="truncate text-muted-foreground">· {lead.nextFollowUp!.title}</span>
        </p>
      )}

      {(tel || wa) && (
        <div className="grid grid-cols-2 gap-px border-t bg-border">
          {tel ? (
            <a href={tel} className="flex min-h-12 items-center justify-center gap-2 bg-card text-sm font-semibold text-primary active:bg-muted/60">
              <Phone className="size-4" /> <span className={compact ? "sr-only" : undefined}>Call</span>
            </a>
          ) : (
            <span className="bg-card" />
          )}
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 bg-card text-sm font-semibold text-emerald-600 active:bg-muted/60 dark:text-emerald-400">
              <MessageCircle className="size-4" /> <span className={compact ? "sr-only" : undefined}>WhatsApp</span>
            </a>
          ) : (
            <span className="bg-card" />
          )}
        </div>
      )}
    </div>
  );
}
