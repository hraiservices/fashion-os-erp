"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, ChevronDown, FileText, MessageCircle, Pencil, Phone, ShoppingBag } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuGroup, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateShort, inr } from "@/lib/format";
import type { TaskDto } from "@/lib/targets-types";
import { useAddLeadActivity, useConvertLead, useDeleteLead, useLead, usePatchTask, useProjects, useTargetsMeta } from "@/hooks/use-targets";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_LEAD_TEMPLATES, LEAD_TEMPLATE_SETTING_KEY, cleanTemplates, fillTemplate } from "@/lib/lead-templates";
import { daysQuiet, leadHeat, neededLabel, quietLevel } from "@/lib/lead-insights";
import { useLeadFollowUp } from "@/hooks/use-lead-follow-up";
import { HeatChip, LikelyStar, StageChip, telHref, useStaffLookup, whatsappHref } from "@/components/targets/shared";
import { BackLink } from "@/components/ui/back-link";
import { LeadAttachments } from "@/components/targets/lead-attachments";
import { LeadAiCard } from "@/components/targets/lead-ai";
import { LeadSummary } from "@/components/targets/lead-summary";
import { LeadPlanCard } from "@/components/targets/lead-plan";
import { TasteNotesCard } from "@/components/crm/taste-notes-card";
import { LeadCustomerPanel, LeadMerge } from "@/components/targets/lead-extras";
import { StageSheet } from "@/components/targets/stage-sheet";
import { TaskSheet } from "@/components/targets/task-sheet";
import { TaskRow } from "@/components/targets/task-row";
import { ShareButton } from "@/components/targets/share-dialog";
import { leadShareMessage } from "@/lib/targets-share";
import { isFinished } from "@/lib/work-tasks";
import { cn } from "@/lib/utils";

/** The soonest open follow-up task, dated ones first — the "Next follow-up" line of a shared lead. */
function nextFollowUp(tasks: TaskDto[]): { title: string; dueDate: string | null } | null {
  const open = tasks.filter((t) => !isFinished(t.status)).sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));
  return open[0] ? { title: open[0].title, dueDate: open[0].dueDate } : null;
}

type Kind = "note" | "call" | "meeting" | "whatsapp";
const KIND_LABEL: Record<string, string> = { note: "Note", call: "Call", meeting: "Meeting", whatsapp: "WhatsApp chat", stage_change: "Stage", created: "Created" };

/** A pasted WhatsApp chat can run to hundreds of lines — show a few and let the rest unfold. */
function ActivityBody({ body, long }: { body: string; long: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className={cn("mt-0.5 whitespace-pre-wrap", long && !open && "line-clamp-6")}>{body}</p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 min-h-11 text-xs font-medium text-primary">
          {open ? "Show less" : "Show the whole chat"}
        </button>
      )}
    </>
  );
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const meta = useTargetsMeta().data;
  const { nameOf } = useStaffLookup(meta);
  const { data, isLoading } = useLead(id);
  const projects = useProjects().data ?? [];
  const addActivity = useAddLeadActivity();
  const followUp = useLeadFollowUp(meta);
  const templatesSetting = useAppSetting<unknown>(LEAD_TEMPLATE_SETTING_KEY, DEFAULT_LEAD_TEMPLATES);
  const templates = cleanTemplates(templatesSetting.data);
  const convert = useConvertLead();
  const patchTask = usePatchTask();
  const toggleTask = (t: TaskDto) => patchTask.mutate({ id: t.id, status: t.status === "done" ? "todo" : "done" });
  const del = useDeleteLead();
  const [stageOpen, setStageOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskDto | null>(null);
  const [kind, setKind] = useState<Kind>("note");
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);

  if (isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-2xl" />;
  if (!data) return <p className="text-sm text-muted-foreground">Lead not found.</p>;
  const { lead, activities, tasks, customer, duplicates } = data;
  const heat = leadHeat(lead, meta?.today ?? "");
  const needed = neededLabel(lead.neededBy, meta?.today ?? "");
  const tel = telHref(lead.mobile);
  const wa = whatsappHref(lead.mobile, `Hello ${lead.name}, `);
  const quiet = daysQuiet(lead, meta?.today ?? "");
  const quietTone = quietLevel(quiet);
  const canEdit = !!meta?.can.manageLeads;
  const closed = lead.stage === "won" || lead.stage === "lost";

  function create(target: "order" | "invoice") {
    convert.mutate(lead.id, {
      onSuccess: (r) => router.push(target === "order" ? r.orderUrl : r.invoiceUrl),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't start it"),
    });
  }

  /** A follow-up for this lead, `days` from today — the Tomorrow / In 3 days / Next week chips and the toast after a call. */
  function quickFollowUp(days: number, label: string) {
    followUp.schedule(lead, days).then(
      () => toast.success(`Follow-up set for ${label.toLowerCase()}`),
      (e) => toast.error(e instanceof Error ? e.message : "Couldn't set the follow-up")
    );
  }

  function addNote() {
    if (!text.trim()) return;
    const savedKind = kind;
    addActivity.mutate(
      { id: lead.id, kind, body: text.trim() },
      {
        onSuccess: () => {
          setText("");
          // After a call or meeting the next step is usually "follow up" — offer it right there.
          if ((savedKind === "call" || savedKind === "meeting") && !closed && canEdit) {
            toast.success(`${KIND_LABEL[savedKind]} logged`, { action: { label: "Follow up tomorrow", onClick: () => quickFollowUp(1, "Tomorrow") }, duration: 8000 });
          }
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save the note"),
      }
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 space-y-5 pb-8">
      <div className="flex items-center justify-between gap-2">
        <BackLink href="/targets?tab=leads">Leads</BackLink>
        <ShareButton title="Share lead" build={(origin) => leadShareMessage(lead, { origin, today: meta?.today ?? "", nameOf }, { labels: meta?.stageLabels, nextFollowUp: nextFollowUp(tasks) })} />
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold leading-tight">
              <span className="truncate">{lead.name}</span>
              {lead.likelyToClose && <LikelyStar on />}
              {heat && <HeatChip heat={heat} />}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{lead.productInterest || "No product noted"}</p>
            {lead.mobile && <p className="text-sm text-muted-foreground">{lead.mobile}</p>}
            <LeadSummary lead={lead} today={meta?.today ?? ""} activities={activities} canEdit={canEdit} />
            {!closed && data?.winChance && (
              <p className="mt-1.5 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" title={`Learned from ${data.winChance.basis} closed leads`}>
                ~{data.winChance.pct}% chance to win
              </p>
            )}
            {quietTone !== "none" && (
              <p className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium", quietTone === "red" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300")}>No activity for {quiet} days</p>
            )}
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
          {lead.leadType && (
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="font-semibold">{lead.leadType}</p>
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
        {(needed || lead.referredBy || lead.outfitType || lead.pieces > 0 || lead.budgetMin > 0 || lead.budgetMax > 0 || lead.measurements) && (
          <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
            {needed && (
              <div>
                <p className="text-xs text-muted-foreground">Needed by</p>
                <p className="font-semibold">{fmtDateShort(lead.neededBy as string)}</p>
                <p className={cn("text-xs", needed.urgent ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{needed.text}</p>
              </div>
            )}
            {lead.referredBy && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Referred by</p>
                <p className="font-semibold">{lead.referredBy}</p>
                {lead.stage === "won" && <p className="text-xs text-muted-foreground">Won — remember to thank them (you can issue a referral coupon from their customer page).</p>}
              </div>
            )}
            {(lead.outfitType || lead.pieces > 0) && (
              <div>
                <p className="text-xs text-muted-foreground">Outfit</p>
                <p className="font-semibold">
                  {lead.outfitType || "Pieces"}
                  {lead.pieces > 0 && ` × ${lead.pieces}`}
                </p>
              </div>
            )}
            {(lead.budgetMin > 0 || lead.budgetMax > 0) && (
              <div>
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="font-semibold">{lead.budgetMin > 0 && lead.budgetMax > 0 ? `${inr(lead.budgetMin)} – ${inr(lead.budgetMax)}` : lead.budgetMax > 0 ? `Up to ${inr(lead.budgetMax)}` : `From ${inr(lead.budgetMin)}`}</p>
              </div>
            )}
            {lead.measurements && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Measurements / sizes</p>
                <p className="whitespace-pre-wrap">{lead.measurements}</p>
              </div>
            )}
          </div>
        )}
        {lead.notes && <p className="whitespace-pre-wrap text-sm">{lead.notes}</p>}
        <div className="grid grid-cols-2 gap-2">
          {tel && (
            <Button variant="outline" className="h-12" nativeButton={false} render={<a href={tel} />}>
              <Phone className="size-4" /> Call
            </Button>
          )}
          {wa && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" className="h-12 text-emerald-600">
                    <MessageCircle className="size-4" /> WhatsApp <ChevronDown className="size-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Start with a message</DropdownMenuLabel>
                  {templates.map((t) => (
                    <DropdownMenuItem key={t.id} render={<a href={whatsappHref(lead.mobile, fillTemplate(t.text, lead)) ?? wa} target="_blank" rel="noopener noreferrer" />} className="min-h-11">
                      {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<a href={wa} target="_blank" rel="noopener noreferrer" />} className="min-h-11">
                  Blank chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

      {customer && <LeadCustomerPanel customer={customer} />}
      {customer && lead.mobile && <TasteNotesCard mobile={lead.mobile} readOnly />}
      <LeadMerge lead={lead} duplicates={duplicates ?? []} labels={meta?.stageLabels} canEdit={canEdit} />

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-muted-foreground">Follow-ups</h2>
          {canEdit && (
            <button type="button" onClick={() => router.push(`/targets/tasks/new?title=${encodeURIComponent(`Follow up with ${lead.name}`)}&linkType=lead&linkId=${lead.id}&linkLabel=${encodeURIComponent(lead.name)}&from=${encodeURIComponent(`/targets/leads/${lead.id}`)}`)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary">
              <CalendarPlus className="size-4" /> Add follow-up
            </button>
          )}
        </div>
        {canEdit && !closed && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick follow-up">
            {([[1, "Tomorrow"], [3, "In 3 days"], [7, "Next week"]] as const).map(([d, label]) => (
              <button key={label} type="button" disabled={followUp.pending} onClick={() => quickFollowUp(d, label)} className="min-h-11 rounded-full border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 disabled:opacity-60 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                {label}
              </button>
            ))}
          </div>
        )}
        {tasks.length > 0 && (
          <div className="overflow-hidden rounded-xl border bg-card">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} today={meta?.today ?? ""} onOpen={setEditTask} onToggle={(x) => toggleTask(x)} />
            ))}
          </div>
        )}
      </section>

      <LeadPlanCard leadId={lead.id} canEdit={canEdit} closed={closed} />
      <LeadAiCard lead={lead} canEdit={canEdit} />

      <LeadAttachments leadId={lead.id} canEdit={canEdit} />

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-muted-foreground">History</h2>
        {canEdit && (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
              {(["note", "call", "meeting", "whatsapp"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={cn("min-h-11 rounded-full border px-1 text-sm font-medium", kind === k ? "border-primary bg-primary/10 text-primary" : "bg-card")}>
                  {k === "whatsapp" ? "WhatsApp" : KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <form className={kind === "whatsapp" ? "space-y-2" : "flex gap-2"} onSubmit={(e) => { e.preventDefault(); addNote(); }}>
              {kind === "whatsapp" ? (
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste the WhatsApp chat here — in WhatsApp, long-press a message, tap Select, then Copy" className="resize-none text-base" maxLength={20000} />
              ) : (
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened?" className="h-12" maxLength={1000} />
              )}
              <Button type="submit" className={kind === "whatsapp" ? "h-12 w-full" : "h-12 shrink-0"} disabled={!text.trim() || addActivity.isPending}>
                {kind === "whatsapp" ? "Save chat to history" : "Save"}
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
              <ActivityBody body={a.body} long={a.kind === "whatsapp" && a.body.length > 400} />
            </li>
          ))}
          {activities.length === 0 && <li className="px-1 text-sm text-muted-foreground">Nothing logged yet.</li>}
        </ul>
      </section>

      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12" onClick={() => router.push(`/targets/leads/${lead.id}/edit`)}>
            <Pencil className="size-4" /> Edit
          </Button>
          <Button
            variant="outline"
            className={confirm ? "h-12 border-red-500 text-red-600" : "h-12"}
            disabled={del.isPending || closed || activities.length > 0}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              del.mutate(lead.id, { onSuccess: () => { toast.success("Lead deleted"); router.push("/targets?tab=leads"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't delete") });
            }}
          >
            {confirm ? "Tap again" : "Delete"}
          </Button>
          {(closed || activities.length > 0) && <p className="col-span-2 text-xs text-muted-foreground">A lead with history can&apos;t be deleted — mark it Lost with a reason instead.</p>}
        </div>
      )}

      <StageSheet lead={lead} open={stageOpen} onOpenChange={setStageOpen} labels={meta?.stageLabels} />
      <TaskSheet open={!!editTask} onOpenChange={(o) => !o && setEditTask(null)} meta={meta} projects={projects} task={editTask} />
    </div>
  );
}
