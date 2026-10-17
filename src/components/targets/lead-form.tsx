"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Scissors, Star, StickyNote, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
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
  const [neededBy, setNeededBy] = useState(lead?.neededBy ?? "");
  const [budgetMin, setBudgetMin] = useState(lead?.budgetMin ?? 0);
  const [budgetMax, setBudgetMax] = useState(lead?.budgetMax ?? 0);
  const [measurements, setMeasurements] = useState(lead?.measurements ?? "");
  const [outfitType, setOutfitType] = useState(lead?.outfitType ?? "");
  const [pieces, setPieces] = useState(lead?.pieces ?? 0);
  const [referredBy, setReferredBy] = useState(lead?.referredBy ?? "");
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
    // The occasion / outfit details only go to the server when they differ from what is saved, so a shop that hasn't
    // run the lead-details migration yet can still save leads that don't use them.
    const details = {
      ...((neededBy || null) !== (lead?.neededBy ?? null) ? { neededBy: neededBy || null } : {}),
      ...(budgetMin !== (lead?.budgetMin ?? 0) ? { budgetMin } : {}),
      ...(budgetMax !== (lead?.budgetMax ?? 0) ? { budgetMax } : {}),
      ...(measurements.trim() !== (lead?.measurements ?? "") ? { measurements: measurements.trim() } : {}),
      ...(outfitType.trim() !== (lead?.outfitType ?? "") ? { outfitType: outfitType.trim() } : {}),
      ...(pieces !== (lead?.pieces ?? 0) ? { pieces } : {}),
      ...(referredBy.trim() !== (lead?.referredBy ?? "") ? { referredBy: referredBy.trim() } : {}),
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
    if (lead) patch.mutate({ id: lead.id, ...payload, ...details }, { onSuccess: done, onError: fail });
    else create.mutate({ ...payload, ...details, allowDuplicate }, { onSuccess: done, onError: fail });
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
        <SectionHeading icon={Scissors} label="Occasion and outfit" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldGroup label="Needed by" hint="e.g. the wedding date. Leads with a close date rise to the top.">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <DatePicker value={neededBy} onChange={setNeededBy} placeholder="Pick a date" />
              </div>
              {neededBy && (
                <Button type="button" variant="ghost" className="h-10 shrink-0" onClick={() => setNeededBy("")}>
                  Clear
                </Button>
              )}
            </div>
          </FieldGroup>
          <FieldGroup label="Referred by (name or mobile)">
            <Input value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="Who sent them to you? (optional)" className="h-10" maxLength={80} />
          </FieldGroup>
          <FieldGroup label="Outfit and pieces">
            <div className="flex gap-2">
              <Input list="lead-outfit-types" value={outfitType} onChange={(e) => setOutfitType(e.target.value)} placeholder="e.g. Lehenga" className="h-10 min-w-0 flex-1" maxLength={80} />
              <datalist id="lead-outfit-types">
                {(meta?.garmentTypes ?? []).map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <NumberInput className="h-10 w-20 shrink-0" inputMode="numeric" placeholder="Qty" min={0} step={1} aria-label="Number of pieces" value={pieces} onChange={(n) => setPieces(Math.max(0, Math.round(n)))} />
            </div>
          </FieldGroup>
          <FieldGroup label="Budget from (₹)">
            <NumberInput className="h-10" value={budgetMin} onChange={setBudgetMin} />
          </FieldGroup>
          <FieldGroup label="Budget up to (₹)">
            <NumberInput className="h-10" value={budgetMax} onChange={setBudgetMax} />
          </FieldGroup>
          <div className="sm:col-span-2">
            <FieldGroup label="Measurements / size notes" hint="Anything they told you — it carries over to the order.">
              <Textarea rows={3} value={measurements} onChange={(e) => setMeasurements(e.target.value)} placeholder="e.g. Blouse 36, length 15; lehenga waist 30" className="resize-none" maxLength={1000} />
            </FieldGroup>
          </div>
        </div>
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
