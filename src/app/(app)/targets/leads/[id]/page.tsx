"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CalendarPlus, FileText, MessageCircle, Pencil, Phone, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { inr } from "@/lib/format";
import type { TaskDto } from "@/lib/targets-types";
import { useAddLeadActivity, useConvertLead, useDeleteLead, useLead, usePatchTask, useProjects, useTargetsMeta } from "@/hooks/use-targets";
import { LikelyStar, StageChip, telHref, useStaffLookup, whatsappHref } from "@/components/targets/shared";
import { StageSheet } from "@/components/targets/stage-sheet";
import { LeadFormSheet } from "@/components/targets/lead-form-sheet";
import { TaskSheet } from "@/components/targets/task-sheet";
import { TaskRow } from "@/components/targets/task-row";
import { cn } from "@/lib/utils";

type Kind = "note" | "call" | "meeting";
const KIND_LABEL: Record<string, string> = { note: "Note", call: "Call", meeting: "Meeting", stage_change: "Stage", created: "Created" };

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const meta = useTargetsMeta().data;
  const { nameOf } = useStaffLookup(meta);
  const { data, isLoading } = useLead(id);
  const projects = useProjects().data ?? [];
  const addActivity = useAddLeadActivity();
  const convert = useConvertLead();
  const patchTask = usePatchTask();
  const toggleTask = (t: TaskDto) => patchTask.mutate({ id: t.id, status: t.status === "done" ? "todo" : "done" });
  const del = useDeleteLead();
  const [stageOpen, setStageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskDto | null>(null);
  const [kind, setKind] = useState<Kind>("note");
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);

  if (isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-2xl" />;
  if (!data) return <p className="text-sm text-muted-foreground">Lead not found.</p>;
  const { lead, activities, tasks } = data;
  const tel = telHref(lead.mobile);
  const wa = whatsappHref(lead.mobile, `Hello ${lead.name}, `);
  const canEdit = !!meta?.can.manageLeads;
  const closed = lead.stage === "won" || lead.stage === "lost";

  function create(target: "order" | "invoice") {
    convert.mutate(lead.id, {
      onSuccess: (r) => router.push(target === "order" ? r.orderUrl : r.invoiceUrl),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't start it"),
    });
  }

  function addNote() {
    if (!text.trim()) return;
    addActivity.mutate({ id: lead.id, kind, body: text.trim() }, { onSuccess: () => setText(""), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save the note") });
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 space-y-5 pb-8">
      <Link href="/targets?tab=leads" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary">
        <ArrowLeft className="size-4" /> Leads
      </Link>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold leading-tight">
              <span className="truncate">{lead.name}</span>
              {lead.likelyToClose && <LikelyStar on />}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{lead.productInterest || "No product noted"}</p>
            {lead.mobile && <p className="text-sm text-muted-foreground">{lead.mobile}</p>}
          </div>
          <button type="button" onClick={() => canEdit && setStageOpen(true)} className="min-h-11 shrink-0" aria-label="Change stage">
            <StageChip stage={lead.stage} labels={meta?.stageLabels} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Expected</p>
            <p className="font-semibold">{inr(lead.expectedValue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Owner</p>
            <p className="font-semibold">{nameOf(lead.assignedEmployeeId)}</p>
          </div>
          {lead.source && (
            <div>
              <p className="text-xs text-muted-foreground">Came from</p>
              <p className="font-semibold">{lead.source}</p>
            </div>
          )}
          {lead.stage === "won" && (
            <div>
              <p className="text-xs text-muted-foreground">Won value</p>
              <p className="font-semibold">{inr(lead.wonValue)}</p>
            </div>
          )}
          {lead.stage === "lost" && lead.lostReason && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Why lost</p>
              <p className="font-semibold">{lead.lostReason}</p>
            </div>
          )}
        </div>
        {lead.notes && <p className="whitespace-pre-wrap text-sm">{lead.notes}</p>}
        <div className="grid grid-cols-2 gap-2">
          {tel && (
            <Button variant="outline" className="h-12" nativeButton={false} render={<a href={tel} />}>
              <Phone className="size-4" /> Call
            </Button>
          )}
          {wa && (
            <Button variant="outline" className="h-12 text-emerald-600" nativeButton={false} render={<a href={wa} target="_blank" rel="noopener noreferrer" />}>
              <MessageCircle className="size-4" /> WhatsApp
            </Button>
          )}
        </div>
      </div>

      {canEdit && !lead.orderId && !lead.invoiceId && lead.stage !== "lost" && (meta?.can.createOrder || meta?.can.createInvoice) && (
        <div className="grid grid-cols-2 gap-2">
          {meta?.can.createOrder && (
            <Button className="h-12" disabled={convert.isPending} onClick={() => create("order")}>
              <ShoppingBag className="size-4" /> Create order
            </Button>
          )}
          {meta?.can.createInvoice && (
            <Button className="h-12" variant="outline" disabled={convert.isPending} onClick={() => create("invoice")}>
              <FileText className="size-4" /> Create invoice
            </Button>
          )}
        </div>
      )}
      {lead.orderId && (
        <Link href={`/orders/${lead.orderId}`} className="block text-sm font-medium text-primary">
          View the order →
        </Link>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-muted-foreground">Follow-ups</h2>
          {canEdit && (
            <button type="button" onClick={() => setTaskOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary">
              <CalendarPlus className="size-4" /> Add follow-up
            </button>
          )}
        </div>
        {tasks.length > 0 && (
          <div className="overflow-hidden rounded-xl border bg-card">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} today={meta?.today ?? ""} onOpen={setEditTask} onToggle={(x) => toggleTask(x)} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-muted-foreground">History</h2>
        {canEdit && (
          <div className="space-y-2">
            <div className="flex gap-2">
              {(["note", "call", "meeting"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={cn("min-h-11 flex-1 rounded-full border text-sm font-medium", kind === k ? "border-primary bg-primary/10 text-primary" : "bg-card")}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addNote(); }}>
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened?" className="h-12" maxLength={1000} />
              <Button type="submit" className="h-12 shrink-0" disabled={!text.trim() || addActivity.isPending}>
                Save
              </Button>
            </form>
          </div>
        )}
        <ul className="space-y-2">
          {activities.map((a) => (
            <li key={a.id} className="rounded-xl border bg-card px-4 py-3 text-sm">
              <p className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-semibold">{KIND_LABEL[a.kind] ?? a.kind}</span>
                <span>{new Date(a.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{a.body}</p>
            </li>
          ))}
          {activities.length === 0 && <li className="px-1 text-sm text-muted-foreground">Nothing logged yet.</li>}
        </ul>
      </section>

      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Edit
          </Button>
          <Button
            variant="outline"
            className={confirm ? "h-12 border-red-500 text-red-600" : "h-12"}
            disabled={del.isPending || closed || activities.length > 1}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              del.mutate(lead.id, { onSuccess: () => { toast.success("Lead deleted"); router.push("/targets?tab=leads"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't delete") });
            }}
          >
            {confirm ? "Tap again" : "Delete"}
          </Button>
          {(closed || activities.length > 1) && <p className="col-span-2 text-xs text-muted-foreground">A lead with history can&apos;t be deleted — mark it Lost with a reason instead.</p>}
        </div>
      )}

      <StageSheet lead={lead} open={stageOpen} onOpenChange={setStageOpen} labels={meta?.stageLabels} />
      <LeadFormSheet open={editOpen} onOpenChange={setEditOpen} meta={meta} lead={lead} />
      <TaskSheet open={taskOpen} onOpenChange={setTaskOpen} meta={meta} projects={projects} defaults={{ title: `Follow up with ${lead.name}`, linkType: "lead", linkId: lead.id, linkLabel: lead.name }} />
      <TaskSheet open={!!editTask} onOpenChange={(o) => !o && setEditTask(null)} meta={meta} projects={projects} task={editTask} />
    </div>
  );
}
