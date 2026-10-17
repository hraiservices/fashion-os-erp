"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { GitMerge, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/ui/search-select";
import { useLeads, useMergeLead } from "@/hooks/use-targets";
import { fmtDateShort, inr } from "@/lib/format";
import { stageLabel, type StageLabelOverrides } from "@/lib/lead-stages";
import type { LeadCustomerDto, LeadDto, LeadDuplicateDto } from "@/lib/targets-types";

/** "Already a customer": their orders so far, so a repeat buyer is spotted at a glance. */
export function LeadCustomerPanel({ customer }: { customer: LeadCustomerDto }) {
  return (
    <section className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
        <UserCheck className="size-4" /> {customer.orders > 0 ? "Existing customer" : "Saved customer"}
        {customer.name && <span className="truncate font-normal">· {customer.name}</span>}
      </p>
      {customer.orders > 0 ? (
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Orders</p>
            <p className="font-semibold">{customer.orders}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="font-semibold">{inr(customer.spent)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last order</p>
            <p className="font-semibold">{customer.lastOrder ? fmtDateShort(customer.lastOrder) : "—"}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      )}
      {customer.outstanding > 0 && <p className="text-sm font-medium text-red-600 dark:text-red-400">{inr(customer.outstanding)} still to collect</p>}
      <Link href={`/crm/${customer.mobile}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
        Open customer profile →
      </Link>
    </section>
  );
}

/**
 * Same-number leads shown as a warning with a Merge button, plus a way to merge in any other lead by hand.
 * Merging keeps THIS lead and folds the other one into it.
 */
export function LeadMerge({ lead, duplicates, labels, canEdit }: { lead: LeadDto; duplicates: LeadDuplicateDto[]; labels?: StageLabelOverrides; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const merge = useMergeLead();
  const all = useLeads({ stage: "all", limit: 500 }, { enabled: open });
  const options = useMemo(() => (all.data?.leads ?? []).filter((l) => l.id !== lead.id).map((l) => ({ value: l.id, label: l.name, sublabel: [l.mobile, stageLabel(l.stage, labels)].filter(Boolean).join(" · ") })), [all.data, lead.id, labels]);
  const target = duplicates.find((d) => d.id === pick) ?? (all.data?.leads ?? []).find((l) => l.id === pick);

  function run() {
    if (!pick) return;
    merge.mutate(
      { id: lead.id, fromId: pick },
      {
        onSuccess: () => {
          toast.success("Leads merged");
          setOpen(false);
          setPick("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't merge the leads"),
      }
    );
  }

  if (!canEdit) return null;
  return (
    <>
      {duplicates.length > 0 && (
        <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Another lead has the same number</p>
          {duplicates.map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <Link href={`/targets/leads/${d.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-primary">
                {d.name} · {stageLabel(d.stage, labels)}
              </Link>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 shrink-0"
                onClick={() => {
                  setPick(d.id);
                  setOpen(true);
                }}
              >
                <GitMerge className="size-4" /> Merge in
              </Button>
            </div>
          ))}
        </section>
      )}
      <button
        type="button"
        onClick={() => {
          setPick("");
          setOpen(true);
        }}
        className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <GitMerge className="size-4" /> Merge another lead into this one
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Merge into {lead.name}</DialogTitle>
            <DialogDescription>Choose the duplicate. Its history, files, follow-ups and orders move onto {lead.name}, then the duplicate is removed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-2">
            <SearchSelect value={pick} options={options} onSelect={setPick} placeholder="Type a name or number…" inputClassName="h-12" fallbackLabel={target?.name} />
            {pick && target && <p className="text-sm text-muted-foreground">{target.name} will be removed after the merge.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-12" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="h-12" disabled={!pick || merge.isPending} onClick={run}>
              {merge.isPending ? "Merging…" : "Merge leads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
