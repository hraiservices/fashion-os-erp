"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star, StickyNote, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldGroup, FormCard, FormShell, SectionHeading, pillClass } from "@/components/targets/form-ui";
import { LEAD_SOURCES } from "@/lib/lead-stages";
import type { LeadDto } from "@/lib/targets-types";
import { errorData, useCreateLead, usePatchLead, type TargetsMeta } from "@/hooks/use-targets";
import { cn } from "@/lib/utils";

const NO_OWNER = "none";

/** Add or edit a lead as a full page, like the app's other New / Edit screens. Owner defaults to the person adding it. */
export function LeadForm({ meta, lead }: { meta: TargetsMeta | undefined; lead?: LeadDto | null }) {
  const router = useRouter();
  const create = useCreateLead();
  const patch = usePatchLead();
  const [name, setName] = useState(lead?.name ?? "");
  const [mobile, setMobile] = useState(lead?.mobile ?? "");
  const [wants, setWants] = useState(lead?.productInterest ?? "");
  const [value, setValue] = useState(lead?.expectedValue ?? 0);
  const [source, setSource] = useState(lead?.source ?? "");
  const [owner, setOwner] = useState<string>(lead ? lead.assignedEmployeeId ?? NO_OWNER : meta?.me.employeeId ?? NO_OWNER);
  const [likely, setLikely] = useState(lead?.likelyToClose ?? false);
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [nameError, setNameError] = useState("");
  const [dupe, setDupe] = useState<{ id: string; message: string } | null>(null);

  const canPickOwner = !!meta && (meta.can.viewAll || meta.can.assignTasks);
  const staff = (meta?.staff ?? []).filter((s) => s.active);
  const busy = create.isPending || patch.isPending;
  const backHref = lead ? `/targets/leads/${lead.id}` : "/targets?tab=leads";

  function save(allowDuplicate = false) {
    if (!name.trim()) {
      setNameError("Enter the person's name");
      return;
    }
    const payload = {
      name: name.trim(),
      mobile: mobile.trim(),
      productInterest: wants.trim(),
      expectedValue: value || 0,
      source,
      likelyToClose: likely,
      notes: notes.trim(),
      assignedEmployeeId: owner === NO_OWNER ? null : owner,
    };
    const done = () => {
      toast.success(lead ? "Lead updated" : "Lead added");
      router.push(backHref);
    };
    const fail = (e: unknown) => {
      const dup = errorData(e).duplicateOf;
      if (typeof dup === "string") setDupe({ id: dup, message: e instanceof Error ? e.message : "Duplicate lead" });
      else toast.error(e instanceof Error ? e.message : "Couldn't save the lead");
    };
    if (lead) patch.mutate({ id: lead.id, ...payload }, { onSuccess: done, onError: fail });
    else create.mutate({ ...payload, allowDuplicate }, { onSuccess: done, onError: fail });
  }

  return (
    <FormShell backHref={backHref} backLabel={lead ? "Lead" : "Leads"} title={lead ? "Edit Lead" : "New Lead"} submitLabel={lead ? "Save Changes" : "Add Lead"} busy={busy} onSubmit={() => save()}>
      <FormCard>
        <SectionHeading icon={UserRound} label="Lead details" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldGroup label="Name" required error={nameError}>
            <Input
              autoFocus={!lead}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError("");
              }}
              placeholder="Who is it?"
              className="h-10"
              maxLength={120}
            />
          </FieldGroup>
          <FieldGroup label="Mobile" hint="10 digits. We warn you if there is already an open lead for this number.">
            <Input type="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit number" className="h-10" maxLength={20} />
          </FieldGroup>
          <FieldGroup label="What do they want?">
            <Input value={wants} onChange={(e) => setWants(e.target.value)} placeholder="e.g. Bridal lehenga, 3 sherwanis" className="h-10" maxLength={200} />
          </FieldGroup>
          <FieldGroup label="Expected amount (₹)">
            <NumberInput className="h-10" value={value} onChange={setValue} />
          </FieldGroup>
        </div>

        {dupe && (
          <div className="mt-4 space-y-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <p>{dupe.message}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-10 flex-1" nativeButton={false} render={<Link href={`/targets/leads/${dupe.id}`} />}>
                Open that lead
              </Button>
              <Button type="button" className="h-10 flex-1" disabled={busy} onClick={() => save(true)}>
                Add anyway
              </Button>
            </div>
          </div>
        )}
      </FormCard>

      <FormCard>
        <SectionHeading icon={Star} label="Source and follow-up" />
        <div className="space-y-4">
          <FieldGroup label="Where did they come from?">
            <div className="flex flex-wrap gap-2">
              {LEAD_SOURCES.map((s) => (
                <button key={s} type="button" onClick={() => setSource(source === s ? "" : s)} className={pillClass(source === s)}>
                  {s}
                </button>
              ))}
            </div>
          </FieldGroup>
          {canPickOwner && (
            <FieldGroup label="Owner">
              <Select value={owner} onValueChange={(v) => v && setOwner(v)}>
                <SelectTrigger className="h-10 w-full">
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
            </FieldGroup>
          )}
          <button type="button" onClick={() => setLikely((l) => !l)} className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left", likely ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "bg-card")}>
            <Star className={cn("size-5", likely ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
            <span className="text-sm font-medium">Likely to close</span>
            <span className="ml-auto text-xs text-muted-foreground">{likely ? "Counted in your forecast" : "Tap to mark"}</span>
          </button>
        </div>
      </FormCard>

      <FormCard>
        <SectionHeading icon={StickyNote} label="Notes" />
        <FieldGroup label="Anything worth remembering">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes about this lead" className="resize-none" maxLength={1000} />
        </FieldGroup>
      </FormCard>
    </FormShell>
  );
}
