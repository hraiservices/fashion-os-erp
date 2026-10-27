"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, Paperclip, Phone } from "lucide-react";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isOpenStage, stageLabel, type StageLabelOverrides } from "@/lib/lead-stages";
import { ACTIVITY_LABEL, daysQuiet, leadHeat, neededLabel, nextStage, quietLevel, timeAgo, daysSince } from "@/lib/lead-insights";
import type { LeadDto } from "@/lib/targets-types";
import { formatMinutes, isUnowned, responseMinutes } from "@/lib/lead-response";
import { dueLabel, DUE_TONE_CLASS, HeatChip, LikelyStar, StageChip, telHref, whatsappHref } from "@/components/targets/shared";
import { CustomerLink } from "@/components/crm/customer-link";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { resolveWhatsAppHref } from "@/lib/whatsapp-launch";

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
  onAdvance,
  compact,
  className,
}: {
  lead: LeadDto;
  today: string;
  ownerName?: string;
  labels?: StageLabelOverrides;
  onStageTap?: (lead: LeadDto) => void;
  /** One-tap "move to the next stage". Omit to hide the button (no permission). */
  onAdvance?: (lead: LeadDto) => void;
  /** Narrow board columns: stacked layout, icon-only Call / WhatsApp. */
  compact?: boolean;
  className?: string;
}) {
  const tel = telHref(lead.mobile);
  const wa = whatsappHref(lead.mobile, `Hello ${lead.name}, `);
  const next = lead.nextFollowUp ? dueLabel(lead.nextFollowUp.dueDate, today) : null;
  const quiet = daysQuiet(lead, today);
  const level = quietLevel(quiet);
  const advanceTo = onAdvance ? nextStage(lead.stage) : null;
  const age = today ? daysSince(lead.createdAt, today) : 0;
  const files = lead.attachmentCount ?? 0;
  const heat = today ? leadHeat(lead, today) : null;
  const needed = today && isOpenStage(lead.stage) ? neededLabel(lead.neededBy, today) : null;
  const unowned = isUnowned(lead);
  const replyMins = responseMinutes(lead);

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className={cn("flex gap-3 p-4 pb-3", compact ? "flex-col gap-1.5 p-3 pb-2" : "items-start")}>
        <Link href={`/targets/leads/${lead.id}`} className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-base font-semibold leading-tight">
            <span className="truncate">{lead.name}</span>
            {lead.likelyToClose && <LikelyStar on />}
            {heat && <HeatChip heat={heat} />}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {lead.productInterest || "No product noted"}
            {lead.expectedValue > 0 && <span className="font-medium text-foreground"> · {inr(lead.expectedValue)}</span>}
          </p>
          {ownerName && <p className="mt-0.5 truncate text-xs text-muted-foreground">{ownerName}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {lead.leadType && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">{lead.leadType}</span>}
            {lead.source && <span>{lead.source}</span>}
            <span>{age === 0 ? "Added today" : `${age}d old`}</span>
            {files > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="size-3" />
                {files}
              </span>
            )}
            {needed && <span className={cn("rounded-full px-1.5 py-0.5 font-medium", needed.urgent ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300")}>{needed.text}</span>}
            {unowned && <span className="rounded-full bg-red-100 px-1.5 py-0.5 font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">No owner</span>}
            {replyMins !== null && replyMins > 60 && <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium">Answered in {formatMinutes(replyMins)}</span>}
            {level !== "none" && (
              <span className={cn("rounded-full px-1.5 py-0.5 font-medium", level === "red" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300")}>{quiet} days quiet</span>
            )}
          </p>
          {lead.lastActivity && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {ACTIVITY_LABEL[lead.lastActivity.kind] ?? lead.lastActivity.kind} · {timeAgo(lead.lastActivity.at)}
            </p>
          )}
        </Link>
        {lead.customerId && <CustomerLink mobile={lead.mobile} label={lead.name} className="mt-0.5 shrink-0 self-start" />}
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

      {(tel || wa || advanceTo) && (
        <div className={cn("grid gap-px border-t bg-border", advanceTo ? "grid-cols-3" : "grid-cols-2")}>
          {tel ? (
            <a href={tel} className="flex min-h-12 items-center justify-center gap-2 bg-card text-sm font-semibold text-primary active:bg-muted/60">
              <Phone className="size-4" /> <span className={compact ? "sr-only" : undefined}>Call</span>
            </a>
          ) : (
            <span className="bg-card" />
          )}
          {wa ? (
            <a href={resolveWhatsAppHref(wa, "business")} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 bg-card text-sm font-semibold text-emerald-600 active:bg-muted/60 dark:text-emerald-400">
              <WhatsAppIcon className="size-4" /> <span className={compact ? "sr-only" : undefined}>WhatsApp</span>
            </a>
          ) : (
            <span className="bg-card" />
          )}
          {advanceTo && (
            <button type="button" onClick={() => onAdvance?.(lead)} aria-label={`Move ${lead.name} to ${stageLabel(advanceTo, labels)}`} className="flex min-h-12 items-center justify-center gap-1 bg-card px-1 text-sm font-semibold text-violet-700 active:bg-muted/60 dark:text-violet-300">
              <span className={cn("truncate", compact && "sr-only")}>{stageLabel(advanceTo, labels)}</span>
              <ChevronRight className="size-4 shrink-0" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
