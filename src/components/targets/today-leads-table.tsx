"use client";

import Link from "next/link";
import { Check, Clock, Phone } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@/hooks/use-column-visibility";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACTIVITY_LABEL, daysQuiet, leadHeat, quietLevel, timeAgo } from "@/lib/lead-insights";
import type { StageLabelOverrides } from "@/lib/lead-stages";
import type { LeadDto } from "@/lib/targets-types";
import { StageChip, HeatChip, dueLabel, DUE_TONE_CLASS, telHref, whatsappHref } from "@/components/targets/shared";

const SNOOZE: { days: number; label: string }[] = [
  { days: 1, label: "Tomorrow" },
  { days: 3, label: "In 3 days" },
  { days: 7, label: "Next week" },
];

/** Column set for the Today tab's list view — a superset, with owner only meaningful when the
 *  viewer can see every staff member's leads (the same `showOwner` gate the card view uses). */
export function todayLeadColumns(showOwner: boolean): ColumnDef[] {
  return [
    { key: "name", label: "Name", required: true },
    { key: "mobile", label: "Mobile" },
    { key: "stage", label: "Stage" },
    { key: "temperature", label: "Temperature" },
    ...(showOwner ? [{ key: "owner", label: "Owner" }] : []),
    { key: "product", label: "Product / Value" },
    { key: "lastActivity", label: "Last activity" },
    { key: "daysQuiet", label: "Days quiet" },
    { key: "nextFollowUp", label: "Next follow-up" },
  ];
}

export const TODAY_LEAD_AUTO_HIDE = { belowWidth: 1600, keys: ["lastActivity", "daysQuiet"] };

/** List-view alternative to the Today tab's lead cards, for one bucket (due/quiet/hot) at a
 *  time — same row actions (Call / WhatsApp / Done / Snooze) as the card view, just denser and
 *  with customizable columns so more of a wide screen's worth of context shows per lead. */
export function TodayLeadsTable({
  leads,
  today,
  labels,
  showOwner,
  nameOf,
  canEdit,
  busy,
  onDone,
  onSnooze,
  isVisible,
}: {
  leads: LeadDto[];
  today: string;
  labels?: StageLabelOverrides;
  showOwner: boolean;
  nameOf: (id: string | null | undefined) => string;
  canEdit: boolean;
  busy: string | null;
  onDone: (lead: LeadDto) => void;
  onSnooze: (lead: LeadDto, days: number, label: string) => void;
  isVisible: (key: string) => boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Name</TableHead>
            {isVisible("mobile") && <TableHead>Mobile</TableHead>}
            {isVisible("stage") && <TableHead>Stage</TableHead>}
            {isVisible("temperature") && <TableHead>Temperature</TableHead>}
            {showOwner && isVisible("owner") && <TableHead>Owner</TableHead>}
            {isVisible("product") && <TableHead>Product / Value</TableHead>}
            {isVisible("lastActivity") && <TableHead>Last activity</TableHead>}
            {isVisible("daysQuiet") && <TableHead className="text-right">Days quiet</TableHead>}
            {isVisible("nextFollowUp") && <TableHead>Next follow-up</TableHead>}
            {canEdit && <TableHead className="w-48" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((l) => {
            const tel = telHref(l.mobile);
            const wa = whatsappHref(l.mobile, `Hello ${l.name}, `);
            const quiet = daysQuiet(l, today);
            const level = quietLevel(quiet);
            const heat = today ? leadHeat(l, today) : null;
            const next = l.nextFollowUp ? dueLabel(l.nextFollowUp.dueDate, today) : null;
            return (
              <TableRow key={l.id}>
                <TableCell />
                <TableCell className="font-medium">
                  <Link href={`/targets/leads/${l.id}`} className="hover:underline">
                    {l.name}
                  </Link>
                </TableCell>
                {isVisible("mobile") && <TableCell className="text-muted-foreground">{l.mobile}</TableCell>}
                {isVisible("stage") && (
                  <TableCell>
                    <StageChip stage={l.stage} labels={labels} />
                  </TableCell>
                )}
                {isVisible("temperature") && <TableCell>{heat && <HeatChip heat={heat} />}</TableCell>}
                {showOwner && isVisible("owner") && <TableCell className="text-muted-foreground">{nameOf(l.assignedEmployeeId)}</TableCell>}
                {isVisible("product") && (
                  <TableCell className="text-muted-foreground">
                    {l.productInterest || "No product noted"}
                    {l.expectedValue > 0 && <span className="font-medium text-foreground"> · {inr(l.expectedValue)}</span>}
                  </TableCell>
                )}
                {isVisible("lastActivity") && (
                  <TableCell className="text-muted-foreground">
                    {l.lastActivity ? `${ACTIVITY_LABEL[l.lastActivity.kind] ?? l.lastActivity.kind} · ${timeAgo(l.lastActivity.at)}` : "—"}
                  </TableCell>
                )}
                {isVisible("daysQuiet") && (
                  <TableCell className={cn("text-right tabular-nums", level !== "none" && (level === "red" ? "font-medium text-red-700 dark:text-red-400" : "font-medium text-amber-700 dark:text-amber-400"))}>
                    {level !== "none" ? quiet : "—"}
                  </TableCell>
                )}
                {isVisible("nextFollowUp") && (
                  <TableCell>{next ? <span className={cn("text-xs font-medium", DUE_TONE_CLASS[next.tone])}>{next.text}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                )}
                {canEdit && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {tel && (
                        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<a href={tel} aria-label={`Call ${l.name}`} />}>
                          <Phone className="size-4" />
                        </Button>
                      )}
                      {wa && <WhatsAppIconButton href={wa} label={`WhatsApp ${l.name}`} className="size-7" />}
                      <Button variant="ghost" size="icon-sm" disabled={busy === l.id} onClick={() => onDone(l)} aria-label="Mark contacted" className="text-emerald-700 dark:text-emerald-400">
                        <Check className="size-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" disabled={busy === l.id} aria-label="Snooze follow-up" className="text-blue-700 dark:text-blue-400">
                              <Clock className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          {SNOOZE.map((o) => (
                            <DropdownMenuItem key={o.days} onClick={() => onSnooze(l, o.days, o.label)}>
                              {o.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
