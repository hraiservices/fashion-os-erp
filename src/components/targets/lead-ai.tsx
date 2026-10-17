"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, FileText, Loader2, MessageCircle, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAiOn, useLeadAi, type GarmentSpec, type LeadBrief, type LeadQuote, type LeadReply, type VoiceSummary } from "@/hooks/use-ai";
import { useAddLeadActivity } from "@/hooks/use-targets";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import type { LeadAttachmentDto, LeadDto } from "@/lib/targets-types";

const waUrl = (mobile: string, text: string) => `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(text)}`;

const REPLY_INTENTS = ["Follow up", "Send the quote", "Ask for measurements", "Thank for visiting", "Gentle nudge"] as const;

/** AI assist on a lead: a quick brief, a ready WhatsApp reply, a quote from the rate card. Suggestions only — staff review before anything is sent. */
export function LeadAiCard({ lead, canEdit }: { lead: LeadDto; canEdit: boolean }) {
  const briefOn = useAiOn("brief");
  const replyOn = useAiOn("reply");
  const quoteOn = useAiOn("quote");
  const brief = useLeadAi<LeadBrief>(lead.id);
  const reply = useLeadAi<LeadReply>(lead.id);
  const quote = useLeadAi<LeadQuote>(lead.id);
  const addNote = useAddLeadActivity();
  const [draft, setDraft] = useState("");

  if (!canEdit || !(briefOn || replyOn || quoteOn)) return null;
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "The AI helper couldn't answer");

  return (
    <section className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-500/30 dark:bg-violet-500/5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 dark:text-violet-300">
        <Sparkles className="size-4" /> AI assist
      </h2>

      <div className="flex flex-wrap gap-2">
        {briefOn && (
          <Button type="button" variant="outline" className="h-11 bg-card" disabled={brief.isPending} onClick={() => brief.mutate({ action: "brief" }, { onError: fail })}>
            {brief.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Brief me
          </Button>
        )}
        {quoteOn && (
          <Button type="button" variant="outline" className="h-11 bg-card" disabled={quote.isPending} onClick={() => quote.mutate({ action: "quote" }, { onError: fail })}>
            {quote.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />} Suggest a quote
          </Button>
        )}
      </div>

      {brief.data && (
        <div className="space-y-1.5 rounded-lg bg-card p-3 text-sm">
          <p>{brief.data.summary}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Occasion</dt>
            <dd>{brief.data.occasion}</dd>
            <dt className="text-muted-foreground">Budget</dt>
            <dd>{brief.data.budget}</dd>
            <dt className="text-muted-foreground">Taste</dt>
            <dd>{brief.data.taste}</dd>
            {brief.data.objections.length > 0 && (
              <>
                <dt className="text-muted-foreground">Worries</dt>
                <dd>{brief.data.objections.join("; ")}</dd>
              </>
            )}
          </dl>
          <p className="text-sm font-medium">Next: {brief.data.nextStep}</p>
        </div>
      )}

      {quote.data && (
        <div className="space-y-1.5 rounded-lg bg-card p-3 text-sm">
          {quote.data.items.length === 0 ? (
            <p className="text-muted-foreground">Not enough detail to suggest a quote yet — add the outfit and number of pieces to the lead.</p>
          ) : (
            <>
              {quote.data.items.map((i, k) => (
                <div key={k} className="flex justify-between gap-2">
                  <span>
                    {i.qty} × {i.type}
                  </span>
                  <span className="tabular-nums">{inr(i.price * i.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1.5 font-semibold">
                <span>Estimate (simple lining)</span>
                <span className="tabular-nums">{inr(quote.data.total)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                About {quote.data.deliveryDays} days to deliver
                {quote.data.fitsDeadline === true && " — fits their date ✓"}
                {quote.data.fitsDeadline === false && " — too late for their needed-by date ⚠"}. {quote.data.notes}
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={() =>
                  addNote.mutate(
                    { id: lead.id, kind: "note", body: `AI quote suggestion: ${quote.data!.items.map((i) => `${i.qty} × ${i.type}`).join(", ")} = ${inr(quote.data!.total)}, about ${quote.data!.deliveryDays} days.` },
                    { onSuccess: () => toast.success("Saved to the history"), onError: fail }
                  )
                }
              >
                Save to history
              </Button>
            </>
          )}
        </div>
      )}

      {replyOn && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Draft a WhatsApp reply</p>
          <div className="flex flex-wrap gap-2">
            {REPLY_INTENTS.map((intent) => (
              <button
                key={intent}
                type="button"
                disabled={reply.isPending}
                onClick={() => reply.mutate({ action: "reply", intent }, { onSuccess: (r) => setDraft(r.text), onError: fail })}
                className="min-h-11 rounded-full border bg-card px-4 text-sm font-medium disabled:opacity-60"
              >
                {intent}
              </button>
            ))}
            <button type="button" disabled={reply.isPending} onClick={() => reply.mutate({ action: "reply" }, { onSuccess: (r) => setDraft(r.text), onError: fail })} className="min-h-11 rounded-full border border-violet-300 bg-card px-4 text-sm font-medium text-violet-700 disabled:opacity-60 dark:text-violet-300">
              {reply.isPending ? "Writing…" : "Reply to their last message"}
            </button>
          </div>
          {draft && (
            <div className="space-y-2 rounded-lg bg-card p-3">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="text-base" aria-label="Drafted WhatsApp message" />
              <div className="flex gap-2">
                {lead.mobile && (
                  <a href={waUrl(lead.mobile, draft)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-sm font-medium text-white">
                    <MessageCircle className="size-4" /> Open in WhatsApp
                  </a>
                )}
                <Button type="button" variant="outline" className="h-11" onClick={() => navigator.clipboard?.writeText(draft).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"))}>
                  <Copy className="size-4" /> Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">AI wrote this — read it before you send.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Describe a reference photo, or summarise a voice note, with AI. */
export function AttachmentAiDialog({ leadId, attachment, onClose }: { leadId: string; attachment: LeadAttachmentDto | null; onClose: () => void }) {
  const isPhoto = attachment?.kind === "image";
  const spec = useLeadAi<GarmentSpec>(leadId);
  const voice = useLeadAi<VoiceSummary>(leadId);
  const addNote = useAddLeadActivity();
  const attachmentId = attachment?.id;
  const specMutate = spec.mutate;
  const voiceMutate = voice.mutate;

  useEffect(() => {
    if (!attachmentId) return;
    const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "The AI helper couldn't answer");
    if (isPhoto) specMutate({ action: "spec", attachmentId }, { onError });
    else voiceMutate({ action: "voice", attachmentId }, { onError });
  }, [attachmentId, isPhoto, specMutate, voiceMutate]);
  const close = () => {
    spec.reset();
    voice.reset();
    onClose();
  };
  const busy = spec.isPending || voice.isPending;
  const s = spec.data;
  const v = voice.data;

  return (
    <Dialog open={!!attachment} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> {isPhoto ? "What the AI sees" : "Voice note, summarised"}
          </DialogTitle>
          <DialogDescription>{attachment?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-6 text-sm">
          {busy && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Reading it…
            </p>
          )}
          {s && (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {([["Garment", s.garment], ["Neckline", s.neckline], ["Sleeves", s.sleeves], ["Fabric", s.fabric], ["Work", s.work], ["Colours", s.colours.join(", ")], ["Notes", s.notes], ["Closest rate-card item", s.rateCardType ?? "No close match"]] as const).map(([k, val]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{val || "—"}</dd>
                  </div>
                ))}
              </dl>
              <Button
                type="button"
                className="h-12 w-full"
                onClick={() =>
                  addNote.mutate(
                    { id: leadId, kind: "note", body: `Reference photo (${attachment!.name}): ${s.garment}; neckline ${s.neckline}; sleeves ${s.sleeves}; fabric ${s.fabric}; work ${s.work}; colours ${s.colours.join("/")}. ${s.notes}`.slice(0, 1000) },
                    { onSuccess: () => { toast.success("Saved to the history"); close(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save") }
                  )
                }
              >
                Save to the lead&apos;s history
              </Button>
            </>
          )}
          {v && (
            <>
              <p className="font-medium">{v.summary || "Couldn't make out the voice note."}</p>
              {v.actions.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5">
                  {v.actions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
              <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{v.transcript}</p>
              <p className="text-xs text-muted-foreground">Saved to the lead&apos;s history.</p>
            </>
          )}
          <Button type="button" variant="outline" className="h-12 w-full" onClick={close}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
