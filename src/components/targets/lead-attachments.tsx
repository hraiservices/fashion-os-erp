"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, ImagePlus, Loader2, MessagesSquare, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttachmentAiDialog } from "@/components/targets/lead-ai";
import { useAiOn } from "@/hooks/use-ai";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { describeSummary, useAttachToLead } from "@/hooks/use-lead-whatsapp";
import { useDeleteLeadAttachment, useLeadAttachments, useUploadLeadAttachments } from "@/hooks/use-targets";
import { LEAD_MEDIA_MAX_BYTES, formatBytes, guessContentType, leadMediaKind } from "@/lib/lead-media";
import type { LeadAttachmentDto } from "@/lib/targets-types";

const ACCEPT = "image/*,audio/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.opus";

/**
 * The files a lead sends on WhatsApp — photos, voice notes, designs, PDFs — kept on the lead so they
 * stop living only in a chat. Photos open full-size, voice notes and videos play in place.
 */
export function LeadAttachments({ leadId, canEdit }: { leadId: string; canEdit: boolean }) {
  const { data: items = [] } = useLeadAttachments(leadId);
  const upload = useUploadLeadAttachments();
  const remove = useDeleteLeadAttachment();
  const inputRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLInputElement>(null);
  const importExport = useAttachToLead();
  const [lightbox, setLightbox] = useState<LeadAttachmentDto | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [aiFor, setAiFor] = useState<LeadAttachmentDto | null>(null);
  const specOn = useAiOn("spec") && canEdit;
  const voiceOn = useAiOn("voice") && canEdit;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length) return;
    const ok = picked.filter((f) => {
      if (f.size > LEAD_MEDIA_MAX_BYTES) {
        toast.error(`${f.name} is over 25 MB`);
        return false;
      }
      if (!leadMediaKind(guessContentType(f.name, f.type))) {
        toast.error(`${f.name}: that kind of file isn't supported`);
        return false;
      }
      return true;
    });
    if (!ok.length) return;
    upload.mutate(
      { id: leadId, files: ok },
      {
        onSuccess: ({ done, failures }) => {
          if (done) toast.success(done === 1 ? "File added" : `${done} files added`);
          failures.forEach((f) => toast.error(f));
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't upload"),
      }
    );
  }

  function onPickExport(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    importExport.mutate(
      { id: leadId, files: [picked] },
      {
        onSuccess: (s) => {
          s.failures.forEach((f) => toast.error(f));
          toast.success(describeSummary(s));
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't import the chat"),
      }
    );
  }

  function onRemove(a: LeadAttachmentDto) {
    if (confirmId !== a.id) {
      setConfirmId(a.id);
      return;
    }
    setConfirmId(null);
    remove.mutate({ leadId, attachmentId: a.id }, { onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't remove it") });
  }

  const images = items.filter((a) => a.kind === "image");
  const audios = items.filter((a) => a.kind === "audio");
  const videos = items.filter((a) => a.kind === "video");
  const files = items.filter((a) => a.kind === "file");

  const RemoveBtn = ({ a, className }: { a: LeadAttachmentDto; className?: string }) =>
    canEdit ? (
      <button
        type="button"
        onClick={() => onRemove(a)}
        aria-label={confirmId === a.id ? "Tap again to remove" : `Remove ${a.name}`}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-xs font-medium ${confirmId === a.id ? "bg-destructive/10 px-2 text-destructive" : "text-muted-foreground"} ${className ?? ""}`}
      >
        {confirmId === a.id ? "Remove?" : <Trash2 className="size-4" />}
      </button>
    ) : null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-muted-foreground">
          WhatsApp files{items.length > 0 && <span className="ml-1.5 font-normal">({items.length})</span>}
        </h2>
        {canEdit && (
          <div className="flex items-center gap-3">
            <input ref={exportRef} type="file" accept=".zip,.txt" className="hidden" onChange={onPickExport} />
            <button type="button" onClick={() => exportRef.current?.click()} disabled={importExport.isPending} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary disabled:opacity-60">
              {importExport.isPending ? <Loader2 className="size-4 animate-spin" /> : <MessagesSquare className="size-4" />}
              {importExport.isPending ? "Importing…" : "Import chat"}
            </button>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={onPick} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={upload.isPending} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary disabled:opacity-60">
              {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {upload.isPending ? "Uploading…" : "Add files"}
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">
          {canEdit ? "Photos, voice notes, designs and PDFs from the WhatsApp chat can be kept here. Tap Add files, or Import chat for a whole conversation." : "No files yet."}
        </p>
      ) : (
        <div className="space-y-3 rounded-xl border bg-card p-3">
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((a) => (
                <div key={a.id} className="relative">
                  <button type="button" onClick={() => a.url && setLightbox(a)} className="block aspect-square w-full overflow-hidden rounded-lg border bg-muted" aria-label={`View ${a.name}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not a static asset next/image can optimise */}
                    {a.url ? <img src={a.url} alt={a.name} className="size-full object-cover" loading="lazy" /> : null}
                  </button>
                  <RemoveBtn a={a} className="absolute right-0.5 top-0.5 bg-background/85 backdrop-blur" />
                  {specOn && (
                    <button type="button" onClick={() => setAiFor(a)} aria-label={`Describe ${a.name} with AI`} className="absolute bottom-0.5 left-0.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-background/85 text-violet-600 backdrop-blur">
                      <Sparkles className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {audios.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Voice notes</p>
              {audios.map((a) => (
                <div key={a.id} className="flex items-center gap-1">
                  {a.url ? <audio controls preload="none" src={a.url} className="h-10 min-w-0 flex-1" /> : <span className="flex-1 text-xs text-muted-foreground">{a.name}</span>}
                  {voiceOn && (
                    <button type="button" onClick={() => setAiFor(a)} aria-label={`Summarise ${a.name} with AI`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-violet-600">
                      <Sparkles className="size-4" />
                    </button>
                  )}
                  <RemoveBtn a={a} />
                </div>
              ))}
            </div>
          )}

          {videos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Videos</p>
              {videos.map((a) => (
                <div key={a.id} className="space-y-1">
                  {a.url && <video controls preload="metadata" src={a.url} className="w-full rounded-lg border bg-black" />}
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{a.name}</span>
                    <RemoveBtn a={a} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Designs &amp; documents</p>
              {files.map((a) => (
                <div key={a.id} className="flex items-center gap-1">
                  <a href={a.url ?? undefined} target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted/50">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(a.sizeBytes)}</span>
                  </a>
                  <RemoveBtn a={a} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AttachmentAiDialog leadId={leadId} attachment={aiFor} onClose={() => setAiFor(null)} />

      <Dialog open={!!lightbox} onOpenChange={(v) => !v && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2 sm:p-3">
          <DialogTitle className="sr-only">{lightbox?.name}</DialogTitle>
          {lightbox?.url && (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
            <img src={lightbox.url} alt={lightbox.name} className="max-h-[80dvh] w-full rounded-lg object-contain" />
          )}
          <Button type="button" variant="outline" className="h-11" onClick={() => setLightbox(null)}>
            <X className="size-4" /> Close
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
