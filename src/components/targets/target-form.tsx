"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Package, StickyNote, Target, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { FieldGroup, FormCard, FormShell, SectionHeading, pillClass } from "@/components/targets/form-ui";
import { METRIC_LABELS, monthRange, type TargetMetric } from "@/lib/targets";
import type { TargetDto } from "@/lib/targets-types";
import { useCreateTarget, usePatchTarget, type TargetsMeta } from "@/hooks/use-targets";
import { cn } from "@/lib/utils";

/** The section heading without its bottom rule, for use inside a collapsible header row. */
function SectionHeadingInline({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="mb-4 flex items-center gap-2">
      <span className="flex size-6 items-center justify-center rounded-md bg-primary/10">
        <Icon className="size-3.5 text-primary" />
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </span>
  );
}

const METRICS = Object.keys(METRIC_LABELS) as TargetMetric[];
const GOAL_HINT: Record<TargetMetric, string> = {
  sales_value: "Goal in ₹",
  order_count: "Number of orders / invoices",
  units: "Number of pieces",
  leads_won: "Number of new customers",
};

/** Plain-words target form: who · what to count · goal · dates. Product filters hide under "Optional". */
export function TargetForm({ meta, target }: { meta: TargetsMeta | undefined; target?: TargetDto }) {
  const router = useRouter();
  const create = useCreateTarget();
  const patch = usePatchTarget();
  const month = monthRange(meta?.today ?? new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState(target?.title ?? "");
  const [scope, setScope] = useState<"shop" | "person">(target?.scope ?? "person");
  const [people, setPeople] = useState<string[]>(target?.assigneeIds ?? []);
  const [metric, setMetric] = useState<TargetMetric>(target?.metric ?? "sales_value");
  const [goal, setGoal] = useState(target ? String(target.targetValue) : "");
  const [start, setStart] = useState(target?.startDate ?? month.start);
  const [end, setEnd] = useState(target?.endDate ?? month.end);
  const [products, setProducts] = useState<string[]>(target?.productIds ?? []);
  const [garments, setGarments] = useState<string[]>(target?.garmentTypes ?? []);
  const [notes, setNotes] = useState(target?.notes ?? "");
  const [more, setMore] = useState(!!(target?.productIds.length || target?.garmentTypes.length));
  const busy = create.isPending || patch.isPending;
  const staff = (meta?.staff ?? []).filter((s) => s.active);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const goalNum = parseFloat(goal);
  const valid = goalNum > 0 && !!start && !!end && end >= start && (scope === "shop" || people.length > 0);

  const problem = !(goalNum > 0) ? "Enter the goal first" : !start || !end || end < start ? "Check the dates" : "Choose who this target is for";

  function save() {
    if (!valid) return;
    const payload = {
      title: title.trim() || `${METRIC_LABELS[metric]} target`,
      metric,
      targetValue: goalNum,
      startDate: start,
      endDate: end,
      scope,
      assigneeIds: scope === "shop" ? [] : people,
      productIds: products,
      garmentTypes: garments,
      notes: notes.trim(),
    };
    const done = () => {
      toast.success(target ? "Target saved" : "Target created");
      router.push("/targets?tab=targets");
    };
    const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't save the target");
    if (target) patch.mutate({ id: target.id, ...payload }, { onSuccess: done, onError: fail });
    else create.mutate(payload, { onSuccess: done, onError: fail });
  }

  const backHref = target ? `/targets/${target.id}` : "/targets?tab=targets";
  const dateError = end < start ? "The end date is before the start date." : "";

  return (
    <FormShell backHref={backHref} backLabel={target ? "Target" : "Targets"} title={target ? "Edit Target" : "New Target"} submitLabel={target ? "Save Target" : "Create Target"} busy={busy} onSubmit={() => (valid ? save() : toast.error(problem))}>
      <FormCard>
        <SectionHeading icon={Users} label="Who is it for?" />
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={pillClass(scope === "person")} onClick={() => setScope("person")}>
              One or more people
            </button>
            <button type="button" className={pillClass(scope === "shop")} onClick={() => setScope("shop")}>
              Whole shop
            </button>
          </div>
          {scope === "person" && (
            <div className="flex flex-wrap gap-2">
              {staff.map((s) => (
                <button key={s.id} type="button" onClick={() => toggle(people, setPeople, s.id)} className={cn(pillClass(people.includes(s.id)), "inline-flex items-center gap-1.5")}>
                  {people.includes(s.id) && <Check className="size-4" />}
                  {s.name}
                </button>
              ))}
              {staff.length === 0 && <p className="text-sm text-muted-foreground">Add staff in Employees first.</p>}
              {people.length > 1 && <p className="w-full text-xs text-muted-foreground">One shared total for everyone picked.</p>}
            </div>
          )}
        </div>
      </FormCard>

      <FormCard>
        <SectionHeading icon={Target} label="Goal" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldGroup label="What should we count?" required className="sm:col-span-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {METRICS.map((m) => (
                <button key={m} type="button" onClick={() => setMetric(m)} className={cn("min-h-11 rounded-xl border px-3 text-left text-sm", metric === m ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card hover:bg-muted/50")}>
                  {METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label={GOAL_HINT[metric]} required>
            <Input type="number" inputMode="decimal" min={0} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="0" className="h-10" />
          </FieldGroup>
          <FieldGroup label="Name" hint="Optional — we name it for you if left empty.">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. October sales" className="h-10" maxLength={120} />
          </FieldGroup>
          <FieldGroup label="From" required>
            <DatePicker value={start} onChange={setStart} className="w-full" />
          </FieldGroup>
          <FieldGroup label="To" required error={dateError}>
            <DatePicker value={end} onChange={setEnd} className="w-full" />
          </FieldGroup>
        </div>
      </FormCard>

      <FormCard>
        <button type="button" onClick={() => setMore((m) => !m)} className="flex w-full items-center justify-between text-left">
          <SectionHeadingInline icon={Package} label="Only count certain products (optional)" />
          <ChevronDown className={cn("mb-4 size-4 transition-transform", more && "rotate-180")} />
        </button>
        {more && (
          <div className="space-y-4">
            <FieldGroup label="Garment types">
              <div className="flex flex-wrap gap-2">
                {(meta?.garmentTypes ?? []).map((g) => (
                  <button key={g} type="button" onClick={() => toggle(garments, setGarments, g)} className={pillClass(garments.includes(g))}>
                    {g}
                  </button>
                ))}
              </div>
            </FieldGroup>
            <FieldGroup label="Shop products">
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                {(meta?.products ?? []).map((p) => (
                  <button key={p.id} type="button" onClick={() => toggle(products, setProducts, p.id)} className={pillClass(products.includes(p.id))}>
                    {p.name}
                  </button>
                ))}
              </div>
            </FieldGroup>
          </div>
        )}
      </FormCard>

      <FormCard>
        <SectionHeading icon={StickyNote} label="Notes" />
        <FieldGroup label="Notes (optional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="resize-none" maxLength={1000} />
        </FieldGroup>
      </FormCard>
    </FormShell>
  );
}
