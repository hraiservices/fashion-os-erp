"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, UserPlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePatchLead, type TargetsMeta } from "@/hooks/use-targets";
import { isUnowned, UNOWNED_ALERT_MINUTES } from "@/lib/lead-response";
import { timeAgo } from "@/lib/lead-insights";
import type { LeadDto } from "@/lib/targets-types";
import { useStaffLookup } from "@/components/targets/shared";
import { cn } from "@/lib/utils";

/**
 * Enquiries sitting with nobody's name on them. Leads are assigned by hand on purpose (the shop's
 * choice), so this is the safety net: anything open and unowned for more than a few minutes shows
 * up here with a one-tap owner picker.
 */
export function UnownedLeadsCard({ leads, meta }: { leads: LeadDto[]; meta: TargetsMeta | undefined }) {
  const patch = usePatchLead();
  const { active: options } = useStaffLookup(meta);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = leads.filter((l) => isUnowned(l));
  // Giving a lead to someone else needs the same permission as assigning tasks.
  if (!meta?.can.manageLeads || rows.length === 0) return null;

  async function assign(lead: LeadDto, employeeId: string) {
    setBusy(lead.id);
    try {
      await patch.mutateAsync({ id: lead.id, assignedEmployeeId: employeeId });
      toast.success(`${lead.name} is now ${options.find((o) => o.id === employeeId)?.name ?? "assigned"}'s lead`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't assign the lead");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-500/30 dark:bg-red-500/5">
      <button type="button" onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300">
          <UserPlus className="size-4 shrink-0" /> {rows.length} {rows.length === 1 ? "enquiry has" : "enquiries have"} no owner
        </span>
        <ChevronDown className={cn("size-4 shrink-0", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <p className="text-xs text-red-700/80 dark:text-red-300/80">Nobody has been given these. They are flagged {UNOWNED_ALERT_MINUTES} minutes after they arrive.</p>
          <ul className="space-y-1">
            {rows.slice(0, 15).map((lead) => (
              <li key={lead.id} className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-sm">
                <Link href={`/targets/leads/${lead.id}`} className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{lead.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {lead.source || "No source"} · waiting {timeAgo(lead.createdAt)}
                  </span>
                </Link>
                {busy === lead.id ? (
                  <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <Select value="" onValueChange={(v) => v && assign(lead, v)}>
                    <SelectTrigger className="h-11 w-32 shrink-0" aria-label={`Give ${lead.name} to someone`}>
                      <SelectValue placeholder="Give to…" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
