"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, Star } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_SOURCES } from "@/lib/lead-stages";
import type { LeadDto } from "@/lib/targets-types";
import { errorData, useCreateLead, usePatchLead, type TargetsMeta } from "@/hooks/use-targets";
import { cn } from "@/lib/utils";

const NO_OWNER = "none";

/**
 * Add or edit a lead. Only four things are asked up front (name, mobile, what they want, expected
 * ₹); everything else is under "More". Owner defaults to the person adding it.
 */
export function LeadFormSheet({
  open,
  onOpenChange,
  meta,
  lead,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: TargetsMeta | undefined;
  /** Pass a lead to edit it; omit to add a new one. */
  lead?: LeadDto | null;
  onSaved?: (id: string | undefined) => void;
}) {
  const create = useCreateLead();
  const patch = usePatchLead();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [wants, setWants] = useState("");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [owner, setOwner] = useState<string>(NO_OWNER);
  const [likely, setLikely] = useState(false);
  const [notes, setNotes] = useState("");
  const [more, setMore] = useState(false);
  const [dupe, setDupe] = useState<{ id: string; message: string } | null>(null);

  const canPickOwner = !!meta && (meta.can.viewAll || meta.can.assignTasks);
  const staff = (meta?.staff ?? []).filter((s) => s.active);
  const busy = create.isPending || patch.isPending;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the sheet opens
    setDupe(null);
    setName(lead?.name ?? "");
    setMobile(lead?.mobile ?? "");
    setWants(lead?.productInterest ?? "");
    setValue(lead?.expectedValue ? String(lead.expectedValue) : "");
    setSource(lead?.source ?? "");
    setOwner(lead ? lead.assignedEmployeeId ?? NO_OWNER : meta?.me.employeeId ?? NO_OWNER);
    setLikely(lead?.likelyToClose ?? false);
    setNotes(lead?.notes ?? "");
    setMore(false);
  }, [open, lead, meta?.me.employeeId]);

  function save(allowDuplicate = false) {
    const payload = {
      name: name.trim(),
      mobile: mobile.trim(),
      productInterest: wants.trim(),
      expectedValue: parseFloat(value) || 0,
      source,
      likelyToClose: likely,
      notes: notes.trim(),
      assignedEmployeeId: owner === NO_OWNER ? null : owner,
    };
    const done = (id?: string) => {
      toast.success(lead ? "Lead updated" : "Lead added");
      onOpenChange(false);
      onSaved?.(id);
    };
    const fail = (e: unknown) => {
      const dup = errorData(e).duplicateOf;
      if (typeof dup === "string") setDupe({ id: dup, message: e instanceof Error ? e.message : "Duplicate lead" });
      else toast.error(e instanceof Error ? e.message : "Couldn't save the lead");
    };
    if (lead) patch.mutate({ id: lead.id, ...payload }, { onSuccess: () => done(lead.id), onError: fail });
    else create.mutate({ ...payload, allowDuplicate }, { onSuccess: (r) => done(r.id), onError: fail });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{lead ? "Edit lead" : "Add a lead"}</SheetTitle>
        </SheetHeader>
        <form
          className="space-y-4 px-4 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save();
          }}
        >
          <div className="space-y-1.5">
            <Label className="text-sm">Name</Label>
            <Input autoFocus={!lead} value={name} onChange={(e) => setName(e.target.value)} placeholder="Who is it?" className="h-12 text-base" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Mobile</Label>
            <Input type="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit number" className="h-12 text-base" maxLength={20} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">What do they want?</Label>
            <Input value={wants} onChange={(e) => setWants(e.target.value)} placeholder="e.g. Bridal lehenga, 3 sherwanis" className="h-12 text-base" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Expected amount ₹</Label>
            <Input type="number" inputMode="decimal" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" className="h-12 text-base" />
          </div>

          <button type="button" onClick={() => setMore((m) => !m)} className="flex min-h-11 w-full items-center justify-between rounded-lg border px-3 text-sm font-medium">
            More
            <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
          </button>

          {more && (
            <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Where did they come from?</Label>
                <div className="flex flex-wrap gap-2">
                  {LEAD_SOURCES.map((s) => (
                    <button key={s} type="button" onClick={() => setSource(source === s ? "" : s)} className={cn("min-h-10 rounded-full border px-3.5 text-sm", source === s ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card")}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {canPickOwner && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Owner</Label>
                  <Select value={owner} onValueChange={(v) => v && setOwner(v)}>
                    <SelectTrigger className="h-12 w-full">
                      <SelectValue>{(v: unknown) => (v === NO_OWNER ? "Nobody yet" : staff.find((s) => s.id === v)?.name ?? "Choose")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_OWNER}>Nobody yet</SelectItem>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <button type="button" onClick={() => setLikely((l) => !l)} className={cn("flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-left", likely ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "bg-card")}>
                <Star className={cn("size-5", likely ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
                <span className="text-sm font-medium">Likely to close</span>
                <span className="ml-auto text-xs text-muted-foreground">{likely ? "Counted in your forecast" : "Tap to mark"}</span>
              </button>
              <div className="space-y-1.5">
                <Label className="text-sm">Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" className="h-12 text-base" maxLength={1000} />
              </div>
            </div>
          )}

          {dupe && (
            <div className="space-y-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p>{dupe.message}</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-11 flex-1" nativeButton={false} render={<Link href={`/targets/leads/${dupe.id}`} />}>
                  Open that lead
                </Button>
                <Button type="button" className="h-11 flex-1" disabled={busy} onClick={() => save(true)}>
                  Add anyway
                </Button>
              </div>
            </div>
          )}

          <Button type="submit" className="h-12 w-full text-base" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : lead ? "Save changes" : "Add lead"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
