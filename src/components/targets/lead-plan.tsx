"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PlanInfo {
  sequences: { id: string; name: string; steps: number }[];
  active: string | null;
}

/**
 * The lead's follow-up plan: a cadence of reminders so nobody has to remember the next touch.
 * Starting one creates ordinary tasks for the lead's owner — staff still send every message
 * themselves. Won and lost leads call off whatever is left automatically.
 */
export function LeadPlanCard({ leadId, canEdit, closed }: { leadId: string; canEdit: boolean; closed: boolean }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string>("");

  const info = useQuery({
    queryKey: ["targets", "lead-plan", leadId],
    enabled: canEdit,
    queryFn: async (): Promise<PlanInfo> => {
      const res = await fetch(`/api/targets/leads/${leadId}/plan`);
      if (!res.ok) throw new Error("Couldn't load the follow-up plans");
      const body = (await res.json().catch(() => null)) as Partial<PlanInfo> | null;
      return { sequences: Array.isArray(body?.sequences) ? body.sequences : [], active: body?.active ?? null };
    },
    staleTime: 60_000,
  });

  const act = useMutation({
    mutationFn: async (payload: { action: "start" | "stop"; sequenceId?: string }) => {
      const res = await fetch(`/api/targets/leads/${leadId}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't change the plan");
      return body as { created?: number; cancelled?: number; name?: string };
    },
    onSuccess: async (r, payload) => {
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "targets" && ["lead", "lead-plan", "tasks", "leads"].includes(q.queryKey[1] as string) });
      toast.success(payload.action === "start" ? `${r.name ?? "Plan"} started — ${r.created ?? 0} follow-ups added` : `Follow-up plan stopped — ${r.cancelled ?? 0} left to do were cancelled`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change the plan"),
  });

  if (!canEdit || !info.data || info.data.sequences.length === 0) return null;
  const { sequences, active } = info.data;
  const activeName = active ? sequences.find((s) => s.id === active)?.name ?? "A plan" : null;
  const chosen = picked || sequences[0].id;

  return (
    <section className="space-y-2 rounded-xl border bg-card p-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <CalendarRange className="size-4 text-muted-foreground" /> Follow-up plan
      </h2>
      {activeName ? (
        <>
          <p className="text-sm">
            On <span className="font-medium">{activeName}</span>. The next steps are waiting in Tasks.
          </p>
          <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" disabled={act.isPending} onClick={() => act.mutate({ action: "stop" })}>
            {act.isPending && <Loader2 className="size-4 animate-spin" />} Stop the plan
          </Button>
        </>
      ) : closed ? (
        <p className="text-sm text-muted-foreground">This lead is decided, so no plan is running.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Creates dated follow-up tasks for whoever owns this lead. Nothing is sent to the customer by itself.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={chosen} onValueChange={(v) => setPicked(v ?? "")}>
              <SelectTrigger className="h-11 sm:w-56" aria-label="Choose a follow-up plan">
                <SelectValue>{(v: unknown) => sequences.find((s) => s.id === v)?.name ?? "Choose a plan"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sequences.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.steps} steps)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" className="h-11" disabled={act.isPending} onClick={() => act.mutate({ action: "start", sequenceId: chosen })}>
              {act.isPending && <Loader2 className="size-4 animate-spin" />} Start
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
