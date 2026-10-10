"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { METRIC_LABELS, monthRange, type TargetMetric } from "@/lib/targets";
import type { TargetDto } from "@/lib/targets-types";
import { useCreateTarget, usePatchTarget, type TargetsMeta } from "@/hooks/use-targets";
import { cn } from "@/lib/utils";

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

  const chip = (on: boolean) => cn("min-h-11 rounded-full border px-4 text-sm font-medium", on ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card");

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Who is it for?</Label>
        <div className="flex gap-2">
          <button type="button" className={chip(scope === "person")} onClick={() => setScope("person")}>
            One or more people
          </button>
          <button type="button" className={chip(scope === "shop")} onClick={() => setScope("shop")}>
            Whole shop
          </button>
        </div>
        {scope === "person" && (
          <div className="flex flex-wrap gap-2 pt-1">
            {staff.map((s) => (
              <button key={s.id} type="button" onClick={() => toggle(people, setPeople, s.id)} className={cn(chip(people.includes(s.id)), "inline-flex items-center gap-1.5")}>
                {people.includes(s.id) && <Check className="size-4" />}
                {s.name}
              </button>
            ))}
            {staff.length === 0 && <p className="text-sm text-muted-foreground">Add staff in Employees first.</p>}
            {people.length > 1 && <p className="w-full text-xs text-muted-foreground">One shared total for everyone picked.</p>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">What should we count?</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {METRICS.map((m) => (
            <button key={m} type="button" onClick={() => setMetric(m)} className={cn("min-h-12 rounded-xl border px-3 text-left text-sm", metric === m ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card")}>
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">{GOAL_HINT[metric]}</Label>
        <Input type="number" inputMode="decimal" min={0} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="0" className="h-12 text-lg" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">From</Label>
          <DatePicker value={start} onChange={setStart} className="h-12 w-full" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">To</Label>
          <DatePicker value={end} onChange={setEnd} className="h-12 w-full" />
        </div>
        {end < start && <p className="col-span-2 text-sm text-red-600">The end date is before the start date.</p>}
      </div>

      <button type="button" onClick={() => setMore((m) => !m)} className="min-h-11 w-full rounded-lg border px-3 text-left text-sm font-medium">
        Optional: only count certain products {more ? "▴" : "▾"}
      </button>
      {more && (
        <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
          <div className="space-y-2">
            <Label className="text-sm">Garment types</Label>
            <div className="flex flex-wrap gap-2">
              {(meta?.garmentTypes ?? []).map((g) => (
                <button key={g} type="button" onClick={() => toggle(garments, setGarments, g)} className={chip(garments.includes(g))}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Shop products</Label>
            <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
              {(meta?.products ?? []).map((p) => (
                <button key={p.id} type="button" onClick={() => toggle(products, setProducts, p.id)} className={chip(products.includes(p.id))}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Name (optional)</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. October sales" className="h-12" maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
      </div>

      <FormActionBar className="-mx-4 justify-start sm:mx-0 sm:justify-end">
        <Button type="button" variant="outline" className="h-12 px-5" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" className="h-12 flex-1 text-base sm:flex-none sm:px-8" disabled={!valid || busy}>
          {busy ? "Saving…" : target ? "Save target" : "Create target"}
        </Button>
      </FormActionBar>
    </form>
  );
}
